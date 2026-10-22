import { Route, Routes } from "react-router-dom";
import { DetailPage } from "./components/DetailPage";
import { ScreeningPage } from "./components/ScreeningPage";
import { WatchlistPage } from "./components/WatchlistPage";
import { ThemeProvider } from "./theme/ThemeContext";
import { ChartSettingsProvider } from "./chartSettings/ChartSettingsContext";

export default function App() {
  return (
    <ThemeProvider>
      <ChartSettingsProvider>
        <Routes>
          <Route path="/" element={<WatchlistPage />} />
          <Route path="/trends/:code" element={<DetailPage />} />
          <Route path="/screening" element={<ScreeningPage />} />
        </Routes>
      </ChartSettingsProvider>
    </ThemeProvider>
  );
}
