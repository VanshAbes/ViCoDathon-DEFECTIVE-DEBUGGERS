import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DashboardPage } from "@/pages/DashboardPage";
import { InterviewsPage } from "@/pages/InterviewsPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { InterviewPage } from "@/pages/InterviewPage";
import { ReviewPage } from "@/pages/ReviewPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/interviews" element={<InterviewsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/interview/:candidateId" element={<InterviewPage />} />
        <Route path="/review/:candidateId" element={<ReviewPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
