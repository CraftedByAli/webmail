import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  NGINX_SITE_TEMPLATE,
  SOGO_REDIRECT_TEMPLATE,
  MAILCOW_COMPOSE,
  MAILCOW_ENV_EXAMPLE,
  renderTemplate,
} from '@/components/docs/snippets';

const read = (p) => fs.readFileSync(p, 'utf8');

describe('docs show the shipped Mailcow files verbatim', () => {
  it.each([
    ['deploy/mailcow/nginx/osmicmails.conf.template', NGINX_SITE_TEMPLATE],
    ['deploy/mailcow/nginx/site.osmicmails.custom.template', SOGO_REDIRECT_TEMPLATE],
    ['deploy/mailcow/docker-compose.yml', MAILCOW_COMPOSE],
    ['deploy/mailcow/osmicmails.env.example', MAILCOW_ENV_EXAMPLE],
  ])('%s', (file, snippet) => {
    expect(snippet).toBe(read(file));
  });

  it('fills every placeholder the installer fills', () => {
    for (const t of [NGINX_SITE_TEMPLATE, SOGO_REDIRECT_TEMPLATE]) {
      expect(renderTemplate(t)).not.toMatch(/__[A-Z_]+__/);
    }
  });
});
