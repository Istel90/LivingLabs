const localInternalToolsOrigin = import.meta.env.DEV
  ? 'http://127.0.0.1:5175'
  : '/internal-tools';

const localSurveyPlatformUrl = import.meta.env.DEV
  ? 'http://127.0.0.1:5174/'
  : '/survey/';

export const internalToolsOrigin =
  import.meta.env.VITE_INTERNAL_TOOLS_ORIGIN || localInternalToolsOrigin;

export const surveyPlatformUrl =
  import.meta.env.VITE_SURVEY_PLATFORM_URL || localSurveyPlatformUrl;

export const citizenSciencePlatformUrl = 'https://livinglab.mangosystem.com/';

export const responsibleDepartmentToolUrl =
  import.meta.env.VITE_RESPONSIBLE_DEPARTMENT_TOOL_URL ||
  `${internalToolsOrigin}/responsible-department`;

export const priorityManagementAreaToolUrl =
  import.meta.env.VITE_PRIORITY_MANAGEMENT_AREA_TOOL_URL ||
  `${internalToolsOrigin}/priority-management-area`;

export const adaptationPathwayToolUrl =
  import.meta.env.VITE_ADAPTATION_PATHWAY_TOOL_URL ||
  `${internalToolsOrigin}/adaptation-pathway`;

export const leadDepartmentToolUrl = `${import.meta.env.BASE_URL}lead-department-tool`;

export const climateDataLabUrl = `${import.meta.env.BASE_URL}climate-scenario-lab`;

export const planningOptimizationLabUrl = `${import.meta.env.BASE_URL}internal-tools/planning-optimization-workspace`;

export const nationalIndicatorStatusUrl = `${import.meta.env.BASE_URL}internal-tools/national-indicator-status`;
