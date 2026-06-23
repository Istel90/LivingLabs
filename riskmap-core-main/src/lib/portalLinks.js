const localPortalPorts = {
    4175: '4173',
    5175: '5173'
};
const localPortalOrigin = import.meta.env.VITE_PORTAL_ORIGIN || 'http://127.0.0.1:5173';

function portalUrl(path) {
    if (typeof window === 'undefined') return `${localPortalOrigin}${path}`;

    const { protocol, hostname, port, origin } = window.location;
    const mappedPort = localPortalPorts[port];
    if ((hostname === '127.0.0.1' || hostname === 'localhost') && mappedPort) {
        return `${protocol}//${hostname}:${mappedPort}${path}`;
    }

    const basePath = import.meta.env.BASE_URL || '/';
    return new URL(`${basePath.replace(/\/$/, '')}${path}`, origin).toString();
}

export const portalToolsUrl =
    import.meta.env.VITE_PORTAL_TOOLS_URL || portalUrl('/tools#adaptation-support-tools');

export const leadDepartmentToolUrl =
    import.meta.env.VITE_LEAD_DEPARTMENT_TOOL_URL || portalUrl('/lead-department-tool');
