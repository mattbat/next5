import { Intro } from './components/Intro';
import { navigate, paths, useRoute } from './router';
import { DiagnosticsScreen } from './screens/DiagnosticsScreen';
import { GameDayScreen } from './screens/GameDayScreen';
import { GameSetupScreen } from './screens/GameSetupScreen';
import { HelpScreen } from './screens/HelpScreen';
import { PlanScreen } from './screens/PlanScreen';
import { ReceiveScreen } from './screens/ReceiveScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TeamScreen } from './screens/TeamScreen';
import { TeamsScreen } from './screens/TeamsScreen';

export function App() {
  const route = useRoute();
  switch (route.name) {
    case 'teams':
      return <TeamsScreen />;
    case 'diagnostics':
      return <DiagnosticsScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'team':
      return <TeamScreen teamId={route.teamId} />;
    case 'game-setup':
      return <GameSetupScreen gameId={route.gameId} />;
    case 'game-plan':
      return <PlanScreen gameId={route.gameId} />;
    case 'game-live':
      return <GameDayScreen gameId={route.gameId} />;
    case 'receive':
      return <ReceiveScreen data={route.data} />;
    case 'help':
      return <HelpScreen topic={route.topic} />;
    case 'welcome':
      return <Intro offerDemo={false} onClose={() => navigate(paths.help())} />;
  }
}
