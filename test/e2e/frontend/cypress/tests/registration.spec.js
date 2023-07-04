describe('FlowForge - Sign Up Page', () => {
    it('should present the relevant default fields', () => {
        cy.intercept('GET', '/api/*/settings').as('getUserSettings')
        cy.visit('/account/create')
        cy.wait('@getUserSettings')

        cy.get('[data-form="signup-username"]').should('be.visible')
        cy.get('[data-form="signup-fullname"]').should('be.visible')
        cy.get('[data-form="signup-email"]').should('be.visible')
        cy.get('[data-form="signup-password"]').should('be.visible')

        cy.get('[data-form="signup-join-reason"]').should('not.exist')
        cy.get('[data-form="signup-accept-tcs"]').should('not.exist')
    })

    it('should present the option to accept the T&Cs if user settings are set accordingly', () => {
        const EXAMPLE_TCS_URL = 'https://example.com/terms-and-conditions'

        cy.intercept('GET', '/api/*/settings', (req) => {
            req.continue((res) => {
                res.body['user:tcs-required'] = true
                res.body['user:tcs-url'] = EXAMPLE_TCS_URL
            })
        }).as('getUserSettings')
        cy.visit('/account/create')
        cy.wait('@getUserSettings')

        cy.get('[data-form="signup-accept-tcs"]').should('be.visible')
        cy.get('[data-form="signup-accept-tcs"] a').should('have.attr', 'href', EXAMPLE_TCS_URL)
    })

    it('should present the "What brings you to FlowForge" question if configured', () => {
        Cypress.on('window:before:load', win => {
            win.posthog = {
                onFeatureFlags: () => {},
                capture: () => {},
                identify: () => {}
            }
        })

        cy.intercept('GET', '/api/*/settings').as('getUserSettings')
        cy.visit('/account/create')
        cy.wait('@getUserSettings')

        cy.get('[data-form="signup-join-reason"]').should('be.visible')
    })

    // it('requires a password', () => {
    //     cy.visit('/')
    //     cy.get('div[label=username] input').should('be.visible')
    //     cy.get('div[label=password] input').should('not.exist')
    //     // fill out username
    //     cy.get('div[label=username] input').type('wrongusername')
    //     // click "login"
    //     cy.get('[data-action="login"]').click()
    //     // should prompt for password as well
    //     cy.get('div[label=username] input').should('be.visible')
    //     cy.get('div[label=password] input').should('be.visible')
    //     // click "login"
    //     cy.get('[data-action="login"]').click()
    //     // should report password is required
    //     cy.get('div[label=password]').should('have.class', 'ff-input--error')
    //     cy.get('[data-el="errors-password"]').should('be.visible')
    //     // check where we are
    //     cy.url().should('not.include', '/applications')
    // })

    // it('prevents a user logging in with incorrect credentials', () => {
    //     cy.visit('/')
    //     cy.get('div[label=username] input').should('be.visible')
    //     cy.get('div[label=password] input').should('not.exist')
    //     // fill out username
    //     cy.get('div[label=username] input').type('wrongusername')
    //     // click "login"
    //     cy.get('[data-action="login"]').click()
    //     // should prompt for password as well
    //     cy.get('div[label=username] input').should('be.visible')
    //     cy.get('div[label=password] input').should('be.visible')
    //     // fill out username
    //     cy.get('div[label=password] input').type('wrongpassword')
    //     // click "login"
    //     cy.get('[data-action="login"]').click()
    //     // display "Login Failed"
    //     cy.get('[data-el="errors-general"]').should('be.visible')
    //     // check where we are
    //     cy.url().should('not.include', '/applications')
    // })

    // it('allows a user to login', () => {
    //     cy.visit('/')
    //     cy.get('div[label=username] input').should('be.visible')
    //     cy.get('div[label=password] input').should('not.exist')
    //     // fill out username
    //     cy.get('div[label=username] input').type('alice')
    //     // click "login"
    //     cy.get('[data-action="login"]').click()
    //     // should prompt for password as well
    //     cy.get('div[label=username] input').should('be.visible')
    //     cy.get('div[label=password] input').should('be.visible')
    //     // fill out pasword
    //     cy.get('div[label=password] input').type('aaPassword')
    //     // click "login"
    //     cy.get('[data-action="login"]').click()
    //     // check where we are
    //     cy.url().should('include', '/applications')
    // })
    // it('prevent long password', () => {
    //     cy.visit('')
    //     // fill out credentials
    //     cy.get('div[label=username] input').type('alice')
    //     cy.get('[data-action="login"]').click()
    //     // should prompt for password as well
    //     cy.get('div[label=username] input').should('be.visible')
    //     cy.get('div[label=password] input').should('be.visible')
    //     let passwd = ''
    //     for (let i = 0; i < 1030; i++) {
    //         passwd += 'x'
    //     }
    //     cy.get('div[label=password] input').type(passwd, { delay: 0.1 })
    //     // click "login"
    //     cy.get('[data-action="login"]').click()
    //     // should have error
    //     cy.get('div[label=password]').should('have.class', 'ff-input--error')
    //     cy.get('[data-el="errors-password"]').should('be.visible')
    //     // check where we are
    //     cy.url().should('not.include', '/applications')
    // })
})
