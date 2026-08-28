<script>
    import '../app.css';
    import ErrorPopupHost from '$lib/ui/ErrorPopupHost.svelte';

    let { children } = $props();
</script>

{@render children()}
<ErrorPopupHost />
