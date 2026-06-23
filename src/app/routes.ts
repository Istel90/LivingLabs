import { createBrowserRouter } from "react-router";
import { HomePage } from "./pages/HomePage";
import { AdaptationGuidePage } from "./pages/AdaptationGuidePage";
import { PlatformPage } from "./pages/PlatformPage";
import { ToolsPage } from "./pages/ToolsPage";
import { MapsDataPage } from "./pages/tools/MapsDataPage";
import { GuidelinesPage } from "./pages/tools/GuidelinesPage";
import { AnalysisToolsPage } from "./pages/tools/AnalysisToolsPage";
import { ApplicationsPage } from "./pages/tools/ApplicationsPage";
import { AboutPage } from "./pages/AboutPage";
import { LeadDepartmentPrototypePage } from "./pages/LeadDepartmentPrototypePage";
import { InternalToolGatewayPage } from "./pages/InternalToolGatewayPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: HomePage,
  },
  {
    path: "/adaptation-guide",
    Component: AdaptationGuidePage,
  },
  {
    path: "/platform",
    Component: PlatformPage,
  },
  {
    path: "/tools",
    Component: ToolsPage,
  },
  {
    path: "/tools/maps-data",
    Component: MapsDataPage,
  },
  {
    path: "/tools/guidelines",
    Component: GuidelinesPage,
  },
  {
    path: "/tools/analysis",
    Component: AnalysisToolsPage,
  },
  {
    path: "/tools/applications",
    Component: ApplicationsPage,
  },
  {
    path: "/lead-department-tool",
    Component: LeadDepartmentPrototypePage,
  },
  {
    path: "/priority-management-area/*",
    Component: InternalToolGatewayPage,
  },
  {
    path: "/responsible-department/*",
    Component: InternalToolGatewayPage,
  },
  {
    path: "/adaptation-pathway/*",
    Component: InternalToolGatewayPage,
  },
  {
    path: "/about",
    Component: AboutPage,
  },
], {
  basename: import.meta.env.BASE_URL,
});
