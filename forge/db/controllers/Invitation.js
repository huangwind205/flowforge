module.exports = {
    createInvitations: async (db, invitor, team, userList) => {
        const results = {};
        for (let i=0; i<userList.length; i++) {
            const userDetail = userList[i];
            const existingUser = await db.models.User.byUsernameOrEmail(userDetail);
            const opts = {
                teamId: team.id
            }
            if (!existingUser) {
                if (!/@/.test(userDetail)) {
                    // not an email - abort
                    results[userDetail] = "Not an existing user, or valid email address";
                    continue;
                } else {
                    opts.external = true;
                    opts.email = userDetail
                }
            } else {
                const existingMemberRole = await db.models.TeamMember.getTeamMembership(existingUser.id, team.id, false);
                if (existingMemberRole) {
                    results[userDetail] = "Already a member of the team";
                    continue;
                }
                opts.external = false;
                opts.inviteeId = existingUser.id;
            }
            const existingInvite = await db.models.Invitation.findOne({where:opts})
            if (existingInvite) {
                results[userDetail] = "Already invited to the team";
                continue;
            }
            opts.invitorId = invitor.id;
            await db.models.Invitation.create(opts);
        }
        return results;
    }
}