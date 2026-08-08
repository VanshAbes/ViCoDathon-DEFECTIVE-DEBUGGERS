import { useNavigate } from "react-router-dom";
import { GridBackground } from "@/components/ui/GridBackground";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <GridBackground>
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 text-center">
        <Logo />
        <div>
          <div className="font-mono text-2xs uppercase tracking-widest2 text-ink-tertiary">Error 404</div>
          <h1 className="mt-2 text-lg font-semibold text-ink-primary">Route not found in this sector</h1>
        </div>
        <Button variant="primary" onClick={() => navigate("/")}>
          Return to Command Center
        </Button>
      </div>
    </GridBackground>
  );
}
