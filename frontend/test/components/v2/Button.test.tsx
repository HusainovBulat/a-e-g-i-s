// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from '../../../components/v2/ui/Button';

describe('v2 Button progress', () => {
  it('renders an accessible in-button progress bar', () => {
    render(<Button icon="mic" disabled progress={0.426}>Initialization</Button>);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('43');
    expect(bar.textContent).toContain('Initialization');
    expect(bar.textContent).toContain('43%');
  });

  it('is a plain button without progress', () => {
    render(<Button>Describe by voice</Button>);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByRole('button', { name: 'Describe by voice' })).toBeTruthy();
  });
});
