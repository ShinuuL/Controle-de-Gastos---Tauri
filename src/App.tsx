import AppShell from "./components/layout/AppShell";
import { ThemeProvider } from "./features/theme/ThemeProvider";

function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

export default App;
