<template>
    <div
        class="ff-page-banner my-4"
        data-el="page-banner-feature-unavailable"
    >
        <SparklesIcon class="ff-icon mr-2" style="stroke-width: 1px;" />
        <div>
            This is a FlowForge Premium feature. Please <a class="ff-link" href="https://flowforge.com/docs/upgrade/open-source-to-premium/" target="_blank" rel="noopener noreferrer">upgrade</a> your instance of Flowforge in order to use it.
        </div>
        <SparklesIcon class="ff-icon ml-2" style="stroke-width: 1px;" />
    </div>
</template>

<script>
import { SparklesIcon } from '@heroicons/vue/outline'

export default {
    name: 'FeatureUnavailable',
    components: {
        SparklesIcon
    }
}
</script>
