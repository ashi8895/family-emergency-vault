/**
 * "Setup progress" logic, kept free of React and the network so it can be tested.
 * The vault only protects anyone once ALL the early steps are done: items exist, two people accepted, pieces made.
 */
export type Tab = 'vault' | 'people' | 'switch' | 'security';

export interface SetupFacts {
  items: number;
  contactsTotal: number;
  contactsAccepted: number;
  armed: boolean; // from the server: key pieces exist and enough people hold a current one
  armedReason: string | null;
  twoFactor: boolean;
}

export interface SetupStep {
  id: 'items' | 'invite' | 'accept' | 'pieces' | 'twofactor';
  title: string;
  short: string; // used once the step is done
  hint: string;
  done: boolean;
  tab: Tab;
  cta: string;
  optional?: boolean;
}

const NEEDED = 2;

export function buildSteps(f: SetupFacts): SetupStep[] {
  return [
    {
      id: 'items',
      short: 'Item added',
      title: 'Add something your family would struggle to find',
      hint: 'For example a life insurance policy or the main bank account. One item is enough to begin.',
      done: f.items >= 1,
      tab: 'vault',
      cta: 'Add an item',
    },
    {
      id: 'invite',
      short: 'People invited',
      title: `Invite ${NEEDED} trusted people`,
      hint: `Spouse, sibling or a close friend. You have invited ${f.contactsTotal} so far.`,
      done: f.contactsTotal >= NEEDED,
      tab: 'people',
      cta: 'Invite people',
    },
    {
      id: 'accept',
      short: 'Invitations accepted',
      title: 'They accept the invitation',
      hint: `Each person opens their link and chooses a passphrase. ${f.contactsAccepted} of at least ${NEEDED} have accepted.`,
      done: f.contactsAccepted >= NEEDED,
      tab: 'people',
      cta: 'See invitations',
    },
    {
      id: 'pieces',
      short: 'Key pieces created',
      title: 'Create the key pieces to switch on the safety net',
      hint:
        f.contactsAccepted < NEEDED
          ? 'This becomes possible after two people have accepted.'
          : (f.armedReason ?? 'Check each verification code with the person, then press Create key pieces.'),
      done: f.armed,
      tab: 'people',
      cta: 'Create key pieces',
    },
    {
      id: 'twofactor',
      short: 'Two-step on',
      title: 'Turn on two-step sign-in',
      hint: 'A stolen password alone then cannot open your account.',
      done: f.twoFactor,
      tab: 'security',
      cta: 'Set it up',
      optional: true,
    },
  ];
}

/** The step to point at next: the first one not done, ignoring optional steps while required ones remain. */
export function nextStep(steps: SetupStep[]): SetupStep | null {
  return steps.find((s) => !s.done && !s.optional) ?? steps.find((s) => !s.done) ?? null;
}

export const progress = (steps: SetupStep[]) => ({ done: steps.filter((s) => s.done).length, total: steps.length });
