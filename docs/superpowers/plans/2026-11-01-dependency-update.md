# Обновление зависимостей squares: хотфикс деплоя + миграция на Vue 3/Vite

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Вернуть зелёный деплой squares.mospan.ru и убрать EOL-стек: Vue 2 + Vue CLI 5 + Yarn 1 → Vue 3 + Vite 8 + npm.

**Architecture:** Этап 0 — правки только в `deployment-playbook`: пин Node LTS, обновление nvm, явный `nvm alias default`. Этапы 1–3 — миграция приложения в `vuejs-squares`: Vite вместо Vue CLI, Vue 3 вместо Vue 2, npm ci вместо yarn, современный ESLint/PWA.

**Tech Stack:** Node 24 LTS, npm 11, Vue 3.5, Vite 8, `@vitejs/plugin-vue` 6, `vite-plugin-pwa` 2, ESLint 10, `eslint-plugin-vue` 10.

**Spec:** этот документ (отдельного design-doc нет).

## Global Constraints

- Целевой Node на проде: `24` (nvm major alias). Диапазон `engines`: `>=22.12.0 <27`.
- Пакетный менеджер после миграции: `npm ci`, lock-файл — `package-lock.json`; `yarn.lock` удаляется.
- Vue 2 API не переписывается на Composition API: компоненты остаются Options API.
- Деплой — ansistrano, `after_deployment_make_targets: [install]`, Makefile target `install` собирает прод-бандл.
- Субпутевые сборки получают `VITE_BASE_PATH` из `ansistrano_hooks/templates/env.production.j2`; `base` в Vite обязан это учитывать.
- Репозиторий приложения: `/Users/mospan/Downloads/dev/repos/vuejs-squares`.
- Репозиторий деплоя: `/Users/mospan/Downloads/dev/repos/deployment-playbook`.

## Review Focus

- Старый service worker (`/service-worker.js`) и новый (`/sw.js`) на одном scope `/` — пользователь не должен застрять на закешированной версии.
- `v-for` + `v-if` на одном элементе в `Squares.vue` — в Vue 3 приоритеты другие, сетка не должна пропасть/сломаться.
- Строковые `ref` внутри `v-for` — `$refs['cellN'][0]` должен остаться валидным, иначе анимации падают с `undefined.style`.
- Сохранённая игра в `localStorage` (формат `gameState`, `cells`, `animation`) — после обновления должна загружаться без исключения.
- `VITE_BASE_PATH` для сборки в субпути — ассеты и PWA не должны ссылаться на корень.

---

## Этап 0. Хотфикс деплоя (deployment-playbook)

### Task 0: Пин Node LTS и обновление nvm

**Files:**
- Modify: `deployment-playbook/host_vars/mospan.ru.yml`
- Modify: `deployment-playbook/roles/packages/tasks/nvm.yml`
- Modify: `deployment-playbook/roles/packages/tasks/npm.yml`

**Interfaces:**
- Produces: `node_version = "24"`, установленный nvm 0.40.8, `nvm alias default 24`; на сервере `node -v` → `v24.x`, `npm -v` → `11.x`.

- [x] **Step 1: Заменить плавающий `stable` на major LTS**

В `host_vars/mospan.ru.yml`:
```yaml
node_version: "24"
```
Удалить `npm_path` — он указывал на несуществующий `versions/node/stable/bin/npm` и использовался только в `creates`-проверке nvm.

- [x] **Step 2: Обновить nvm и починить `creates`**

В `roles/packages/tasks/nvm.yml` поставить `v0.40.8` вместо `v0.38.0`, убрать `creates` (иначе существующий `nvm.sh` не даст обновиться) и проверять установку по `{{ nvm_dir }}/nvm.sh`:
```yaml
- name: install or update nvm
  shell: >
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash
  vars:
    ansible_ssh_user: deploy
```

- [x] **Step 3: Переключить default alias**

В `roles/packages/tasks/npm.yml`:
```yaml
- name: install node
  command: "bash -c '. {{ nvm_path }}; nvm install {{ node_version }} && nvm alias default {{ node_version }}'"
  vars:
    ansible_ssh_user: deploy
```

- [x] **Step 4: Проверить YAML/синтаксис**

Run: `ansible-playbook --syntax-check deploy_squares.mospan.ru.yml`
Expected: `playbook: deploy_squares.mospan.ru.yml` без ошибок (vault может потребовать пароль — тогда проверить `python -c "import yaml; yaml.safe_load(open(...))"` для изменённых файлов).

- [x] **Step 5: Проверить версию на сервере до деплоя**

Run: `ssh deploy@mospan.ru 'bash -lc ". ~/.nvm/nvm.sh; nvm alias default; node -v; npm -v"'`
Expected: `default -> 24`, `v24.x`, `npm 11.x`.

- [x] **Step 6: Передеплоить**

Run: `ansible-playbook deploy_squares.mospan.ru.yml`
Expected: `make install` проходит, сайт открывается.

- [x] **Step 7: Коммит**

```bash
cd deployment-playbook
git add host_vars/mospan.ru.yml roles/packages/tasks/nvm.yml roles/packages/tasks/npm.yml
git commit -m "fix: pin node lts and update nvm for deploys"
```

Аварийный вариант, если правка плейбука недоступна: временно `yarn install --ignore-engines` в Makefile (не коммитить как постоянное решение).

**Результат (2026-11-01):** nvm 0.40.8, Node `v24.22.2`, npm `11.19.1`, `nvm alias default -> 24`; деплой `ok=43 changed=5 failed=0`, релиз `20261101113332Z`, https://squares.mospan.ru → HTTP 200. Коммит playbook: `dc0f295`.

---

## Этап 1. Подготовка репозитория (vuejs-squares)

### Task 1: Зафиксировать Node и baseline

**Files:**
- Create: `.nvmrc`
- Modify: `package.json`

- [x] **Step 1: Создать `.nvmrc`**

```
24
```

- [x] **Step 2: Добавить `engines`**

```json
"engines": { "node": ">=22.12.0 <27" }
```

- [x] **Step 3: Проверить baseline на Node 24**

Run: `nvm install 24 && nvm use 24 && rm -rf node_modules && yarn install && yarn build`
Expected: сборка Vue CLI 5 проходит. Если нет — не блокироваться, сразу переходить к этапу 2.

- [x] **Step 4: Коммит**

```bash
git add .nvmrc package.json
git commit -m "chore: pin node version"
```

---

## Этап 2. Миграция Vue 3 + Vite + npm

### Task 2: package.json, Vite, index.html

**Files:**
- Modify: `package.json`
- Delete: `yarn.lock`
- Create: `package-lock.json` (генерируется)
- Create: `vite.config.js`
- Move: `public/index.html` → `index.html`
- Modify: `Makefile`
- Delete: `vue.config.js`, `babel.config.js`, `.browserslistrc`
- Modify: `postcss.config.js` (ESM)

- [x] **Step 1: Переписать зависимости и скрипты**

```json
{
  "name": "squares",
  "version": "0.2.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.12.0 <27" },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint . --fix",
    "prepare": "husky"
  },
  "dependencies": {
    "vue": "^3.5.44"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^6.0.10",
    "eslint": "^10.14.0",
    "eslint-plugin-vue": "^10.12.0",
    "husky": "^9.1.7",
    "lint-staged": "^17.6.0",
    "vite": "^8.3.5",
    "vite-plugin-pwa": "^2.0.0"
  },
  "lint-staged": {
    "*.{js,vue}": "eslint --fix"
  }
}
```

Удаляются: `@vue/cli-*`, `vue-template-compiler`, `babel-eslint`, `@vue/eslint-config-airbnb`, `lodash.template`, `mixin-deep`, `serialize-javascript`, `register-service-worker`, `peerDependencies`.

- [x] **Step 2: Создать `vite.config.js`**

```js
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [
      vue(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false,
        cleanupOutdatedCaches: true,
        manifest: {
          name: 'Квадраты',
          short_name: 'Квадраты',
          theme_color: '#2196f3',
          background_color: '#ffffff',
          display: 'fullscreen',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            { src: 'img/icons/icon-72x72.png', sizes: '72x72', type: 'image/png' },
            { src: 'img/icons/icon-96x96.png', sizes: '96x96', type: 'image/png' },
            { src: 'img/icons/icon-128x128.png', sizes: '128x128', type: 'image/png' },
            { src: 'img/icons/icon-144x144.png', sizes: '144x144', type: 'image/png' },
            { src: 'img/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
            { src: 'img/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'img/icons/icon-384x384.png', sizes: '384x384', type: 'image/png' },
            { src: 'img/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
      }),
    ],
  };
});
```

- [x] **Step 3: Перенести `index.html` в корень и подключить entry**

Добавить перед `</body>`: `<script type="module" src="/src/main.js"></script>`. Остальную разметку сохранить.

- [x] **Step 4: Перевести `postcss.config.js` на ESM**

```js
export default { plugins: { autoprefixer: {} } };
```

`autoprefixer` не входит в новые зависимости — либо добавить `autoprefixer` в devDependencies, либо удалить `postcss.config.js` (Vite сам префиксует по browserslist). Решение: удалить файл, если autoprefixer не нужен явно.

- [x] **Step 5: Удалить vue-cli/babel артефакты, обновить Makefile**

```make
install:
	npm ci --include=dev
	npm run build
```

```bash
rm yarn.lock vue.config.js babel.config.js .browserslistrc
npm install
```

- [x] **Step 6: Проверить сборку**

Run: `rm -rf node_modules && npm ci && npm run build`
Expected: `dist/index.html`, `dist/assets/*`, `dist/sw.js`, `dist/manifest.webmanifest`; ошибок нет.

- [x] **Step 7: Коммит**

```bash
git add -A
git commit -m "build: migrate to vite and npm"
```

### Task 3: Vue 3 в коде приложения

**Files:**
- Modify: `src/main.js`
- Modify: `src/components/Squares.vue`
- Modify: `src/registerServiceWorker.js`
- Delete: `public/manifest.json` (манифест теперь в vite.config.js)

- [x] **Step 1: `src/main.js`**

```js
import { createApp } from 'vue';
import App from './App.vue';
import './registerServiceWorker';

createApp(App).mount('#app');
```

- [x] **Step 2: `src/registerServiceWorker.js`**

```js
/* eslint-disable no-console */
import { registerSW } from 'virtual:pwa-register';

if (import.meta.env.PROD) {
  registerSW({
    immediate: true,
    onOfflineReady() { console.log('App is ready to work offline.'); },
    onNeedRefresh() { console.log('New content is available; please refresh.'); },
    onRegisteredSW(swUrl) { console.log(`Service worker registered: ${swUrl}`); },
    onRegisterError(error) { console.error('Error during service worker registration:', error); },
  });
}
```

- [x] **Step 3: Убрать `v-for` + `v-if` с одного элемента**

В шаблоне `Squares.vue` (строки 20–28) обернуть:
```html
<template v-for="(cell, index) in cells" :key="index">
  <div v-if="game.status !== game.statuses.GAME_OVER"
       class="field-cell"
       @click="fieldCellOnClick(cell)"
       :class="{ clicked: cell.clicked, animated: cell.animation.enabled }"
       :style="getFieldCellStyle(cell)"
       :ref="'cell' + index"
  ></div>
</template>
```

- [x] **Step 4: Удалить lodash**

Заменить три использования:
- `_.forEach(animation.properties, (range, property) => {...})` → `Object.entries(animation.properties).forEach(([property, range]) => {...})`;
- `_.isEqual(activeDirections, { top:false, right:false, bottom:false, left:false })` → `!activeDirections.top && !activeDirections.right && !activeDirections.bottom && !activeDirections.left`;
- `_.isEqual(x, {})` → `Object.keys(x).length === 0`.

Удалить `import _ from 'lodash/lodash';`.

- [x] **Step 5: Заменить `process.env`**

`process.env.BASE_URL` → `import.meta.env.BASE_URL`, `process.env.NODE_ENV === 'production'` → `import.meta.env.PROD`.

- [x] **Step 6: Проверить refs и сборку**

Run: `npm run build && npm run dev`
Expected: сетка рендерится, клики работают, анимации не падают. Если `$refs.cellN` не массив — убрать `[0]` в `getElement`.

- [x] **Step 7: Коммит**

```bash
git add -A
git commit -m "feat: migrate to vue 3 and vite"
```

**Результат этапов 1–2 (2026-11-01):**

- baseline на Node 24 локально не гонялся: на машине нет nvm/yarn, но Vue CLI 5 уже успешно собрался на проде на Node 24 (этап 0) — этого достаточно.
- локальные проверки шли на Node 26.12 (удовлетворяет `engines`); прод — Node 24.
- `postcss.config.js` удалён, а не переведён на ESM: autoprefixer не нужен, Vite префиксует сам.
- добавлены `eslint.config.js` (flat config, `@eslint/js`) и `.husky/pre-commit` (`npx lint-staged`), т.к. после удаления vue-cli/yorkie git-хуки перестали бы работать.
- проверено: `npm ci --include=dev && npm run build` — успешно; `eslint .` — 0 ошибок; headless Chrome: 6 вариантов игры, 25 клеток 5x5, все позиционированы (`$refs` работают), клик работает, перезагрузка восстанавливает `gameState` из localStorage, ошибок в консоли нет.
- `npm audit --omit=dev` — 0 уязвимостей; 16 moderate/low только в dev-цепочке workbox-build (build-time, в бандл не попадает).
- коммиты: `f00ec7f` (план), `debeea1` (Node), `165e143` (Vue 3 + Vite).

---

## Этап 3. Проверка и деплой

### Task 4: Smoke-тест и прод

- [ ] **Step 1: Ручной smoke-тест**

Проверить: старт игры 3x3…12x12, клик, исчезновение линии, сдвиг, game over, счёт, high score, перезагрузка восстанавливает `gameState`, offline после первой загрузки.

Частично автоматизировано (headless Chrome): старт 5x5, 25 позиционированных клеток, клик, сохранение/восстановление `gameState`. Анимации исчезновения/сдвига, game over и offline остаются на ручную проверку после деплоя.

- [x] **Step 2: Чистая установка**

Run: `rm -rf node_modules dist && npm ci && npm run build`
Expected: успешная сборка.

- [x] **Step 3: Линт**

Run: `npm run lint`
Expected: без ошибок (или зафиксировать остаток и не блокировать деплой — линт не входит в `make install`).

- [ ] **Step 4: Деплой**

Run: `ansible-playbook deploy_squares.mospan.ru.yml`
Expected: релиз создан, `curl -I https://squares.mospan.ru` → 200, новый `sw.js` и хэши ассетов.

- [ ] **Step 5: Откат при проблеме**

Вернуть предыдущий симлинк `current` (ansistrano хранит 3 релиза) или revert коммита миграции.
