import { readFile as fsReadFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from '../../frontend/src/components/AppShell.tsx';

/** Existing interaction suites now exercise the real React component markup. */
export async function readFile(path, encoding) {
  if (String(path).endsWith('/web/index.html')) {
    return '<!doctype html><html lang="zh-CN"><head><title>提示蜂</title></head><body><div id="root">'
      + renderToStaticMarkup(createElement(AppShell)) + '</div></body></html>';
  }
  return fsReadFile(path, encoding);
}
