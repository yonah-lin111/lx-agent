import { Navigate, Route, Routes } from "react-router-dom"
import { PAGE_ROUTES } from "@/lib/pageRoutes"
import { FrontDesignPage } from "@/pages/front-design"
import { HomePage } from "@/pages/home"
import { OpenClawPage } from "@/pages/openclaw"
import { ProjectPage } from "@/pages/project"
import { SettingsPage } from "@/pages/settings"
import { UiPreviewPage } from "@/pages/ui"

/**
 * 声明业务页面路由。
 */
export const PageRouter = (): React.JSX.Element => (
  <Routes>
    <Route path={PAGE_ROUTES.home} element={<HomePage />} />
    <Route path={PAGE_ROUTES.project} element={<ProjectPage />} />
    <Route path={PAGE_ROUTES.settings} element={<SettingsPage />} />
    <Route path={PAGE_ROUTES.ui} element={<UiPreviewPage />} />
    <Route path={PAGE_ROUTES.design} element={<FrontDesignPage />} />
    <Route path={PAGE_ROUTES.openclaw} element={<OpenClawPage />} />
    <Route path="*" element={<Navigate replace to={PAGE_ROUTES.home} />} />
  </Routes>
)
