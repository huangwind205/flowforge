<!-- eslint-disable vue/no-v-html -->

<template>
    <ff-layout-box class="ff-signup">
        <template v-slot:splash-content v-if="splash">
            <div v-html="splash" data-el="splash"></div>
        </template>
        <form v-if="!emailSent && !ssoCreated" class="max-w-md m-auto">
            <p v-if="settings['branding:account:signUpTopBanner']" data-el="banner-text"
               class="text-center -mt-6 pb-4 text-gray-400"
               v-html="settings['branding:account:signUpTopBanner']"></p>
            <div>
                <label>Username</label>
                <ff-text-input ref="signup-username" data-form="signup-username" label="username" :error="errors.username" v-model="input.username" />
                <span class="ff-error-inline">{{ errors.username }}</span>
                <label>Full Name</label>
                <ff-text-input ref="signup-fullname" data-form="signup-fullname" label="Full Name" :error="errors.name" v-model="input.name" />
                <span class="ff-error-inline">{{ errors.name }}</span>
                <label>E-Mail Address</label>
                <ff-text-input ref="signup-email" data-form="signup-email" label="E-Mail Address" :error="errors.email" v-model="input.email" />
                <span class="ff-error-inline">{{ errors.email }}</span>
                <label>Password</label>
                <ff-text-input ref="signup-password" data-form="signup-password" label="password" :error="errors.password" v-model="input.password" type="password"/>
                <span class="ff-error-inline">{{ errors.password }}</span>
            </div>
            <div class="pt-3" v-if="askJoinReason">
                <ff-radio-group label="What brings you to FlowForge?" v-model="input.join_reason" orientation="grid"
                                data-form="signup-join-reason" :options="reasons" />
            </div>
            <div class="pt-3" v-if="settings['user:tcs-required']">
                <ff-checkbox v-model="input.tcs_accepted" data-form="signup-accept-tcs">
                    I accept the <a target="_blank" :href="settings['user:tcs-url']">FlowForge Terms &amp; Conditions.</a>
                </ff-checkbox>
            </div>
            <label v-if="errors.general" class="pt-3 ff-error-inline">{{ errors.general }}</label>
            <div class="ff-actions pt-2">
                <ff-button :disabled="!formValid || busy || tooManyRequests" @click="registerUser()" data-action="sign-up">
                    <span>Sign Up</span>
                    <span class="w-4">
                        <SpinnerIcon v-if="busy || tooManyRequests" class="ff-icon ml-3 !w-3.5" />
                    </span>
                </ff-button>
                <p class="flex text-gray-400 font-light mt-6 gap-2 w-full justify-center">
                    Already registered? <a href="/" data-action="login">Log in here</a>
                </p>
            </div>
        </form>
        <div v-else-if="emailSent">
            <h5>Confirm your e-mail address.</h5>
            <p>Please click the link in the email we sent to {{ input.email }}</p>
        </div>
        <div v-else>
            <p>You can now login using your SSO Provider.</p>
            <ff-button :to="{ name: 'Home' }" data-action="login">Login</ff-button>
        </div>
    </ff-layout-box>
</template>

<script>
import { useRoute } from 'vue-router'
import { mapState } from 'vuex'

import userApi from '../../api/user.js'

import SpinnerIcon from '../../components/icons/Spinner.js'
import FFLayoutBox from '../../layouts/Box.vue'

export default {
    name: 'AccountCreate',
    components: {
        'ff-layout-box': FFLayoutBox,
        SpinnerIcon
    },
    data () {
        return {
            busy: false,
            tooManyRequests: false,
            createDisabled: false,
            teams: [],
            emailSent: false,
            ssoCreated: false,
            input: {
                name: '',
                username: '',
                email: '',
                password: '',
                join_reason: null,
                tcs_accepted: false,
                code: ''
            },
            errors: {
                email: '',
                password: ''
            },
            reasons: [
                { label: 'Business Needs', value: 'business' },
                { label: 'Personal Use', value: 'personal' },
                { label: 'Educational Use', value: 'education' },
                { label: 'Other', value: 'other' }
            ]
        }
    },
    mounted () {
        this.input.email = useRoute().query.email || ''
    },
    computed: {
        ...mapState('account', ['settings', 'pending']),
        splash () {
            return this.settings['branding:account:signUpLeftBanner']
        },
        formValid () {
            return (this.input.email && !this.errors.email) &&
                   (this.input.username && !this.errors.username) &&
                   this.input.password.length >= 8 &&
                   (this.askJoinReason ? this.input.join_reason : true) &&
                   (this.settings['user:tcs-required'] ? this.input.tcs_accepted : true) &&
                   (!this.errors.name)
        },
        askJoinReason () {
            return !!window.posthog
        }
    },
    watch: {
        'input.username': function (v) {
            if (v && !/^[a-z0-9-_]+$/i.test(v)) {
                this.errors.username = 'Must only contain a-z 0-9 - _'
            } else {
                this.errors.username = ''
            }
        },
        'input.email': function (v) {
            if (v && !/.+@.+/.test(v)) {
                this.errors.email = 'Enter a valid email address'
            } else {
                this.errors.email = ''
            }
        },
        'input.password': function (v) {
            if (this.errors.password && v.length >= 8) {
                this.errors.password = ''
            }
        },
        'input.name': function (v) {
            if (v && /:\/\//i.test(v)) {
                this.errors.name = 'Names can not be URLs'
            } else {
                this.errors.name = ''
            }
        }
    },
    methods: {
        checkPassword () {
            if (this.input.password.length < 8) {
                this.errors.password = 'Password must be at least 8 characters'
            } else {
                this.errors.password = ''
            }
        },
        registerUser () {
            if (this.$route.query.code) {
                this.input.code = this.$route.query.code
            }
            const opts = { ...this.input, name: this.input.name || this.input.username }
            this.busy = true // show spinner
            this.errors.general = '' // clear any previous errors
            userApi.registerUser(opts).then(result => {
                if (result.sso_enabled) {
                    this.ssoCreated = true
                } else {
                    this.emailSent = true
                }
                this.busy = false
            }).catch(err => {
                console.error(err.response.data)
                this.busy = false
                if (err.response.data) {
                    if (/username/.test(err.response.data.error)) {
                        this.errors.username = 'Username unavailable'
                    }
                    if (/password/.test(err.response.data.error)) {
                        this.errors.password = 'Invalid username'
                    }
                    if (err.response.data.code === 'invalid_sso_email') {
                        this.errors.email = err.response.data.error
                    } else if (/email/.test(err.response.data.error)) {
                        this.errors.email = 'Email unavailable'
                    } else if (err.response.data.statusCode === 429) {
                        this.errors.general = 'Too many attempts. Try again later.'
                        this.tooManyRequests = true
                        setTimeout(() => {
                            this.tooManyRequests = false
                        }, 10000)
                    } else if (err.response.data.error === 'user registration not enabled') {
                        // TODO Where to show this error?
                        this.errors.general = 'User registration is not enabled'
                    }
                }
            })
        }
    }
}
</script>
