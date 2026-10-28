import { SolvencyProviders } from "./app/providers";
import SolvencyLoopDashboard from "./app/page";

export default function App() {
  return (
    <SolvencyProviders>
      <SolvencyLoopDashboard />
    </SolvencyProviders>
  );
}
