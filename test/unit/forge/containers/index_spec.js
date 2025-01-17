const sinon = require('sinon')
const should = require('should') // eslint-disable-line
const setup = require('./setup')

// async function waitFor(delay) {
//     return new Promise((resolve) => { setTimeout(() => resolve(), delay) })
// }

describe('Container Wrapper', function () {
    // Use standard test data.
    let app

    afterEach(async function () {
        await app.close()
    })

    async function setupProject (name = 'test-project-one') {
        const stackProperties = {
            name: 'defaultStack',
            active: true,
            properties: { foo: 'bar' }
        }
        const stack = await app.db.models.ProjectStack.create(stackProperties)
        const project = await app.db.models.Project.create({
            name,
            type: '',
            url: ''
        })
        await project.setProjectStack(stack)
        const team = await app.db.models.Team.byName('ATeam')
        await team.addProject(project)
        return app.db.models.Project.byId(project.id)
    }

    describe('start', function () {
        beforeEach(async function () {
            app = await setup()
        })

        it('returns before project is actually started', async function () {
            const project = await setupProject()

            // This call should return as soon as the driver has accepted
            // the call, but not yet completed it
            const result = await app.containers.start(project)

            const initialDetails = await app.containers.details(project)
            initialDetails.should.have.property('state', 'starting')

            // The result includes a sub-promise to wait on for when the
            // driver has actually started the project
            await result.started

            const newDetails = await app.containers.details(project)
            newDetails.should.have.property('state', 'running')
        })
    })

    describe('stop', function () {
        beforeEach(async function () {
            app = await setup()
        })
        it('stopping a project puts it into suspended state', async function () {
            const project = await setupProject()
            const result = await app.containers.start(project)
            await result.started

            // Default state value - this may change in the future
            project.state.should.equal('running')

            const details = await app.containers.details(project)
            details.should.have.property('state', 'running')

            await app.containers.stop(project)

            await project.reload()
            project.state.should.equal('suspended')

            const newDetails = await app.containers.details(project)
            newDetails.should.have.property('state', 'suspended')
        })
        it('stopping a suspended project does not call the driver', async function () {
            const project = await setupProject()
            const result = await app.containers.start(project)
            await result.started

            // Default state value - this may change in the future
            project.state.should.equal('running')

            // Put it manually into suspended state to check the logic.
            project.state = 'suspended'
            await project.save()

            await app.containers.stop(project)

            // Check the driver still thinks it is running as it didn't
            // get told to stop
            const newDetails = await app.containers.details(project)
            newDetails.should.have.property('state', 'running')
        })
    })

    describe('remove', function () {
        beforeEach(async function () {
            app = await setup()
        })
        it('removes a running project from the driver', async function () {
            const project = await setupProject()
            const result = await app.containers.start(project)
            await result.started

            const details = await app.containers.details(project)
            details.should.have.property('state', 'running')

            await app.containers.remove(project)

            const newDetails = await app.containers.details(project)
            should.not.exist(newDetails)
        })
        it('removes a suspended project from the driver', async function () {
            const project = await setupProject()
            const result = await app.containers.start(project)
            await result.started
            await app.containers.stop(project)
            const details = await app.containers.details(project)
            details.should.have.property('state', 'suspended')

            await app.containers.remove(project)

            const newDetails = await app.containers.details(project)
            should.not.exist(newDetails)
        })
    })

    describe('billing', function () {
        let billingProjects = {}

        beforeEach(async function () {
            app = await setup({
                license: 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJGbG93Rm9yZ2UgSW5jLiIsInN1YiI6IkZsb3dGb3JnZSBJbmMuIERldmVsb3BtZW50IiwibmJmIjoxNjYyNDIyNDAwLCJleHAiOjc5ODY5MDIzOTksIm5vdGUiOiJEZXZlbG9wbWVudC1tb2RlIE9ubHkuIE5vdCBmb3IgcHJvZHVjdGlvbiIsInVzZXJzIjoxNTAsInRlYW1zIjo1MCwicHJvamVjdHMiOjUwLCJkZXZpY2VzIjo1MCwiZGV2Ijp0cnVlLCJpYXQiOjE2NjI0ODI5ODd9.e8Jeppq4aURwWYz-rEpnXs9RY2Y7HF7LJ6rMtMZWdw2Xls6-iyaiKV1TyzQw5sUBAhdUSZxgtiFH5e_cNJgrUg',
                billing: {
                    stripe: {}
                }
            })

            sinon.stub(app.billing)
            app.billing.addProject.callsFake(async (team, project) => {
                if (project.name === 'fail_billing_add') {
                    throw new Error('Billing add error')
                }
                billingProjects[team.id] = billingProjects[team.id] || {}
                billingProjects[team.id][project.id] = project
            })

            app.billing.removeProject.callsFake(async (team, project) => {
                billingProjects[team.id][project.id] = null
            })
        })

        afterEach(function () {
            app.billing.addProject.resetHistory()
            app.billing.removeProject.resetHistory()

            billingProjects = {}
        })

        describe('start', function () {
            it('rejects start project if team does not have a subscription', async function () {
                const project = await setupProject()
                const promise = app.containers.start(project)
                await promise.should.be.rejectedWith({ code: 'billing_required' })
            })

            it('rejects if team does not have an active subscription', async function () {
                const project = await setupProject()
                const team = await app.db.models.Team.byName('ATeam')

                const subscription = await app.db.controllers.Subscription.createSubscription(team, 'my-subscription', 'a-customer')
                subscription.status = app.db.models.Subscription.STATUS.CANCELED
                await subscription.save()
                should(subscription.isCanceled()).equal(true)

                const promise = app.containers.start(project)
                await promise.should.be.rejectedWith({ code: 'billing_required' })
            })

            it('adds project to team subscription', async function () {
                const project = await setupProject()
                const team = await app.db.models.Team.byName('ATeam')
                await app.db.controllers.Subscription.createSubscription(team, 'my-subscription', 'a-customer')
                const result = await app.containers.start(project)
                await result.started
                billingProjects.should.have.property(1)
                billingProjects[1].should.have.property(project.id)
                billingProjects[1][project.id].should.not.equal(null)
            })

            it('rejects if billing fails to add project', async function () {
            // A project name of 'fail_billing_add' will cause the billing
            // stub defined above to fail
                const project = await setupProject('fail_billing_add')
                const team = await app.db.models.Team.byName('ATeam')
                await app.db.controllers.Subscription.createSubscription(team, 'my-subscription', 'a-customer')
                const promise = app.containers.start(project)
                await promise.should.be.rejectedWith(/Problem adding project to subscription/)
            })

            it('reverts billing if driver fails to start project', async function () {
            // A project name of 'stub-fail-start' will cause the stub driver
            // to fail the create after a short delay
                const project = await setupProject('stub-fail-start')
                const team = await app.db.models.Team.byName('ATeam')
                await app.db.controllers.Subscription.createSubscription(team, 'my-subscription', 'a-customer')
                const promise = await app.containers.start(project)
                await promise.started
                billingProjects.should.have.property(1)
                billingProjects[1].should.have.property(project.id, null)
            })
        })

        describe('stop', function () {
            it('removes a running project from billing when the project is stopped', async function () {
                const project = await setupProject()
                const team = await app.db.models.Team.byName('ATeam')
                await app.db.controllers.Subscription.createSubscription(team, 'my-subscription', 'a-customer')
                const result = await app.containers.start(project)
                await result.started
                billingProjects.should.have.property(1)
                billingProjects[1].should.have.property(project.id)
                billingProjects[1][project.id].should.not.equal(null)
                // Now we have a project added to billing - stop it and check it is
                // removed

                await app.containers.stop(project)
                project.state.should.equal('suspended')
                billingProjects.should.have.property(1)
                billingProjects[1].should.have.property(project.id, null)
                app.billing.addProject.callCount.should.equal(1)
                app.billing.removeProject.callCount.should.equal(1)
            })

            it('does not remove a suspended project from billing when stopping', async function () {
                const project = await setupProject()
                const team = await app.db.models.Team.byName('ATeam')
                await app.db.controllers.Subscription.createSubscription(team, 'my-subscription', 'a-customer')
                project.state = 'suspended'
                await project.save()
                await app.containers.stop(project)
                project.state.should.equal('suspended')
                app.billing.addProject.callCount.should.equal(0)
                app.billing.removeProject.callCount.should.equal(0)
            })

            it('stop project succeeds even with out a subscription - always allow a stop', async function () {
                const project = await setupProject()
                const team = await app.db.models.Team.byName('ATeam')
                await app.db.controllers.Subscription.createSubscription(team, 'my-subscription', 'a-customer')
                const result = await app.containers.start(project)
                await result.started

                await app.db.controllers.Subscription.deleteSubscription(team)

                await app.containers.stop(project).should.be.resolved()
            })

            it('still stops the project even if the team does not have an active subscription', async function () {
                const project = await setupProject()
                const team = await app.db.models.Team.byName('ATeam')

                const subscription = await app.db.controllers.Subscription.createSubscription(team, 'my-subscription', 'a-customer')

                const result = await app.containers.start(project)
                await result.started

                subscription.status = app.db.models.Subscription.STATUS.CANCELED
                await subscription.save()
                should(subscription.isCanceled()).equal(true)

                await app.containers.stop(project)
                project.state.should.equal('suspended')
            })
        })

        describe('remove', function () {
            it('removes a running project from billing when the project is removed', async function () {
                const project = await setupProject()
                const team = await app.db.models.Team.byName('ATeam')
                await app.db.controllers.Subscription.createSubscription(team, 'my-subscription', 'a-customer')
                const result = await app.containers.start(project)
                await result.started
                billingProjects.should.have.property(1)
                billingProjects[1].should.have.property(project.id)
                billingProjects[1][project.id].should.not.equal(null)
                // Now we have a project added to billing - remove it and check it is
                // removed from billing

                await app.containers.remove(project)
                billingProjects.should.have.property(1)
                billingProjects[1].should.have.property(project.id, null)
                app.billing.addProject.callCount.should.equal(1)
                app.billing.removeProject.callCount.should.equal(1)
            })

            it('does not remove a suspended project from billing when removing', async function () {
                const project = await setupProject()
                const team = await app.db.models.Team.byName('ATeam')
                await app.db.controllers.Subscription.createSubscription(team, 'my-subscription', 'a-customer')
                const result = await app.containers.start(project)
                await result.started

                // A little artificial to force the model into suspended state - but
                // it ensure any unexpected inconsistencies get handled properly

                project.state = 'suspended'
                await project.save()

                await app.containers.remove(project)
                app.billing.removeProject.callCount.should.equal(0)
            })

            it('rejects the removal if the team does not have a subscription', async function () {
                const project = await setupProject()
                const team = await app.db.models.Team.byName('ATeam')
                await app.db.controllers.Subscription.createSubscription(team, 'my-subscription', 'a-customer')
                const result = await app.containers.start(project)
                await result.started

                // A little artificial to force the model into suspended state - but
                // it ensure any unexpected inconsistencies get handled properly

                project.state = 'suspended'
                await project.save()

                await app.db.controllers.Subscription.deleteSubscription(team)

                const promise = app.containers.stop(project)
                await promise
                promise.should.be.rejectedWith({ code: 'billing_required' })
            })

            it('removes the running project from the driver and billing if the subscription is cancelled', async function () {
                const project = await setupProject()
                const team = await app.db.models.Team.byName('ATeam')
                const subscription = await app.db.controllers.Subscription.createSubscription(team, 'my-subscription', 'a-customer')
                const result = await app.containers.start(project)
                await result.started

                subscription.status = app.db.models.Subscription.STATUS.CANCELED
                await subscription.save()
                should(subscription.isCanceled()).equal(true)

                await app.containers.remove(project)
                app.billing.removeProject.callCount.should.equal(1)
            })
        })

        describe('mock driver', function () {
            const sandbox = sinon.createSandbox()

            let mockDriver

            beforeEach(function () {
                mockDriver = {
                    startFlows: sandbox.fake(),
                    stopFlows: sandbox.fake(),
                    restartFlows: sandbox.fake()
                }

                app.containers.init(app, mockDriver, {})
            })

            afterEach(function () {
                sandbox.restore()
            })

            describe('startFlows', function () {
                it('starts flows if the team has an active subscription', async function () {
                    const project = await setupProject()
                    const team = await app.db.models.Team.byName('ATeam')
                    await app.db.controllers.Subscription.createSubscription(team, 'my-subscription', 'a-customer')
                    await app.containers.startFlows(project, {})

                    mockDriver.startFlows.callCount.should.equal(1)
                })
                it('does not start the flows if the team has no subscription', async function () {
                    const project = await setupProject()
                    const promise = app.containers.startFlows(project, {})
                    await promise.should.be.rejectedWith({ code: 'billing_required' })
                    mockDriver.startFlows.callCount.should.equal(0)
                })
                it('starts if the project is in trial mode', async function () {
                    const project = await setupProject()
                    const team = await app.db.models.Team.byName('ATeam')
                    await app.db.controllers.Subscription.createTrialSubscription(team, Date.now() + (5 * 86400000))

                    await app.containers.startFlows(project, {})

                    mockDriver.startFlows.callCount.should.equal(1)
                })

                it('does not start the flows if the teams subscription is cancelled', async function () {
                    const project = await setupProject()
                    const team = await app.db.models.Team.byName('ATeam')
                    const subscription = await app.db.controllers.Subscription.createSubscription(team, 'my-subscription', 'a-customer')

                    subscription.status = app.db.models.Subscription.STATUS.CANCELED
                    await subscription.save()
                    should(subscription.isCanceled()).equal(true)

                    const promise = app.containers.startFlows(project, {})
                    await promise.should.be.rejectedWith({ code: 'billing_required' })

                    mockDriver.startFlows.callCount.should.equal(0)
                })
            })

            describe('stopFlows', function () {
                it('still stops even if the team had a cancelled subscription', async function () {
                    const project = await setupProject()
                    const team = await app.db.models.Team.byName('ATeam')
                    const subscription = await app.db.controllers.Subscription.createSubscription(team, 'my-subscription', 'a-customer')

                    subscription.status = app.db.models.Subscription.STATUS.CANCELED
                    await subscription.save()
                    should(subscription.isCanceled()).equal(true)

                    await app.containers.stopFlows(project, {})

                    mockDriver.stopFlows.callCount.should.equal(1)
                })
            })

            describe('restartFlows', function () {
                it('restarts if the team has an active subscription', async function () {
                    const project = await setupProject()
                    const team = await app.db.models.Team.byName('ATeam')
                    await app.db.controllers.Subscription.createSubscription(team, 'my-subscription', 'a-customer')

                    await app.containers.restartFlows(project, {})

                    mockDriver.restartFlows.callCount.should.equal(1)
                })
                it('does not restart the flows if the team has no subscription', async function () {
                    const project = await setupProject()
                    const promise = app.containers.restartFlows(project, {})
                    await promise.should.be.rejectedWith({ code: 'billing_required' })
                    mockDriver.startFlows.callCount.should.equal(0)
                })
                it('restarts if the project is in trial mode', async function () {
                    const project = await setupProject()
                    const team = await app.db.models.Team.byName('ATeam')
                    await app.db.controllers.Subscription.createTrialSubscription(team, Date.now() + (5 * 86400000))

                    await app.containers.restartFlows(project, {})

                    mockDriver.restartFlows.callCount.should.equal(1)
                })
                it('does not restart the flows if the teams subscription is cancelled', async function () {
                    const project = await setupProject()
                    const team = await app.db.models.Team.byName('ATeam')
                    const subscription = await app.db.controllers.Subscription.createSubscription(team, 'my-subscription', 'a-customer')

                    subscription.status = app.db.models.Subscription.STATUS.CANCELED
                    await subscription.save()
                    should(subscription.isCanceled()).equal(true)

                    const promise = app.containers.restartFlows(project, {})
                    await promise.should.be.rejectedWith({ code: 'billing_required' })

                    mockDriver.restartFlows.callCount.should.equal(0)
                })
            })
        })
    })
})
