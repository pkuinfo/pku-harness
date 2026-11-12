import type { SetupStep } from '../../flow';
import { StepAIArt } from './step-ai-art';
import { StepCampusArt } from './step-campus-art';
import { StepPermissionsArt } from './step-permissions-art';

/** Header illustration for a setup step (the finish step shows the 3D hero instead). */
export function StepArt({ step }: { step: SetupStep }) {
  switch (step) {
    case 'ai':
      return <StepAIArt />;
    case 'campus':
      return <StepCampusArt />;
    case 'permissions':
      return <StepPermissionsArt />;
    default:
      return null;
  }
}
