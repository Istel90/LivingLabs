<slot />

<style>
    :global(.planning-workspace-layout-placeholder) { display: contents; }
    :global(.tool-shell .workspace > .sidebar) {
        display: none !important;
    }
    :global(.tool-shell .workspace) {
        grid-template-columns: minmax(820px, 1fr) 300px !important;
    }
    :global(.tool-shell .main) {
        padding-left: 36px !important;
        padding-right: 36px !important;
    }
    :global(.tool-shell .map-wrap) {
        height: 620px !important;
    }
    @media (max-width: 1200px) {
        :global(.tool-shell .workspace) {
            grid-template-columns: 1fr !important;
        }
        :global(.tool-shell .map-wrap) {
            height: 560px !important;
        }
    }
</style>
