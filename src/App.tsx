import { useRoute } from './router';
import { GameDayScreen } from './screens/GameDayScreen';
import { GameSetupScreen } from './screens/GameSetupScreen';
import { PlanScreen } from './screens/PlanScreen';
import { TeamScreen } from './screens/TeamScreen';
import { TeamsScreen } from './screens/TeamsScreen';

export function App() {
  const route = useRoute();
  switch (route.name) {
    case 'teams':
      return <TeamsScreen />;
    case 'team':
      return <TeamScreen teamId={route.teamId} />;
    case 'game-setup':
      return <GameSetupScreen gameId={route.gameId} />;
    case 'game-plan':
      return <PlanScreen gameId={route.gameId} />;
    case 'game-live':
      return <GameDayScreen gameId={route.gameId} />;
  }
}
