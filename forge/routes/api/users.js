const { getUserLogger } = require('../../lib/audit-logging')
const sharedUser = require('./shared/users')

/**
 * Users api routes
 *
 * - /api/v1/users
 *
 * @namespace users
 * @memberof forge.routes.api
 */
module.exports = async function (app) {
    const userAuditLog = getUserLogger(app)
    // Lets assume all apis that access bulk users are admin only.
    app.addHook('preHandler', app.verifyAdmin)
    app.addHook('preHandler', async (request, reply) => {
        if (request.params.userId !== undefined) {
            if (request.params.userId) {
                try {
                    request.user = await app.db.models.User.byId(request.params.userId)
                    if (!request.user) {
                        reply.code(404).send({ code: 'not_found', error: 'Not Found' })
                        return
                    }
                } catch (err) {
                    reply.code(404).send({ code: 'not_found', error: 'Not Found' })
                }
            } else {
                reply.code(404).send({ code: 'not_found', error: 'Not Found' })
            }
        }
    })
    /**
     * Get a list of all known users
     * @name /api/v1/users
     * @static
     * @memberof forge.routes.api.users
     */
    app.get('/', async (request, reply) => {
        const paginationOptions = app.getPaginationOptions(request)
        const users = await app.db.models.User.getAll(paginationOptions)
        users.users = users.users.map(u => app.db.views.User.userProfile(u))
        reply.send(users)
    })

    /**
     * Get a user's settings
     * @name /api/v1/users/:userId
     * @static
     * @memberof forge.routes.api.users
     */
    app.get('/:userId', async (request, reply) => {
        reply.send(app.db.views.User.userProfile(request.user))
    })

    /**
     * Update user settings
     * @name /api/v1/users/:userId
     * @static
     * @memberof forge.routes.api.users
     */
    app.put('/:userId', async (request, reply) => {
        await sharedUser.updateUser(app, request.user, request, reply, 'users')
    })

    /**
     * Create a new user
     * @name /api/v1/users/:userId
     * @static
     * @memberof forge.routes.api.users
     */
    app.post('/', {
        schema: {
            body: {
                type: 'object',
                required: ['name', 'username', 'password'],
                properties: {
                    name: { type: 'string' },
                    username: { type: 'string' },
                    password: { type: 'string' },
                    isAdmin: { type: 'boolean' },
                    createDefaultTeam: { type: 'boolean' }
                }
            }
        }
    }, async (request, reply) => {
        const logUserInfo = {
            name: request.body.name,
            username: request.body.username,
            email: request.body.email,
            admin: !!request.body.isAdmin
        }
        if (/^(admin|root)$/.test(request.body.username)) {
            const resp = { code: 'invalid_username', error: 'invalid username' }
            await userAuditLog.users.createUser(request.session.User, resp, logUserInfo)
            reply.code(400).send(resp)
            return
        }
        if (request.body.createDefaultTeam) {
            const teamLimit = app.license.get('teams')
            const teamCount = await app.db.models.Team.count()
            if (teamCount >= teamLimit) {
                const resp = { code: 'team_limit_reached', error: 'Unable to create user team: license limit reached' }
                await userAuditLog.users.createUser(request.session.User, resp, logUserInfo)
                reply.code(400).send(resp)
                return
            }
        }
        try {
            const newUser = await app.db.models.User.create({
                username: request.body.username,
                name: request.body.name,
                email: request.body.email,
                email_verified: true,
                password: request.body.password,
                admin: !!request.body.isAdmin
            })
            logUserInfo.id = newUser.id
            await userAuditLog.users.createUser(request.session.User, null, logUserInfo)
            if (request.body.createDefaultTeam) {
                const team = await app.db.controllers.Team.createTeamForUser({
                    name: `Team ${request.body.name}`,
                    slug: request.body.username,
                    TeamTypeId: (await app.db.models.TeamType.byName('starter')).id
                }, newUser)
                await userAuditLog.users.autoTeamCreate(request.session.User, null, team, logUserInfo)
            }
            reply.send({ status: 'okay' })
        } catch (err) {
            let responseMessage
            let responseCode = 'unexpected_error'
            if (/user_username_lower_unique|Users_username_key/.test(err.parent?.toString())) {
                responseMessage = 'username not available'
                responseCode = 'invalid_username'
            } else if (/user_email_lower_unique|Users_email_key/.test(err.parent?.toString())) {
                responseMessage = 'email not available'
                responseCode = 'invalid_email'
            } else if (err.errors) {
                responseMessage = err.errors.map(err => err.message).join(',')
            } else {
                responseMessage = err.toString()
            }
            const resp = { code: responseCode, error: responseMessage }
            await userAuditLog.users.createUser(request.session.User, resp, logUserInfo)
            reply.code(400).send(resp)
        }
    })

    /**
     * Delete a user
     * @name /api/v1/users/:userId
     * @static
     * @memberof forge.routes.api.users
     */
    app.delete('/:userId', async (request, reply) => {
        try {
            await request.user.destroy()
            await userAuditLog.users.deleteUser(request.session.User, null, request.user)
            reply.send({ status: 'okay' })
        } catch (err) {
            const resp = { code: 'unexpected_error', error: err.toString() }
            await userAuditLog.users.deleteUser(request.session.User, resp, request.user)
            reply.code(400).send(resp)
        }
    })
}
