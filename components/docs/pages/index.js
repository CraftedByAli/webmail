import Introduction from '@/components/docs/pages/introduction';
import QuickStart from '@/components/docs/pages/quick-start';
import MailcowGuide from '@/components/docs/pages/mailcow';
import DockerGuide from '@/components/docs/pages/docker';
import ReverseProxy from '@/components/docs/pages/reverse-proxy';
import Configuration from '@/components/docs/pages/configuration';
import Security from '@/components/docs/pages/security';
import Operations from '@/components/docs/pages/operations';
import Troubleshooting from '@/components/docs/pages/troubleshooting';

/** Page bodies by slug; titles and order live in components/docs/nav.js. */
export const DOCS_CONTENT = {
  '': Introduction,
  'quick-start': QuickStart,
  mailcow: MailcowGuide,
  docker: DockerGuide,
  'reverse-proxy': ReverseProxy,
  configuration: Configuration,
  security: Security,
  operations: Operations,
  troubleshooting: Troubleshooting,
};
