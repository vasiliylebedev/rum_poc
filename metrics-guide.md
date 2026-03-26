# Инструкция по сбору RUM-метрик

## Что такое RUM-метрики

RUM (Real User Monitoring) — сбор данных о производительности с реальных пользователей. Мы измеряем, сколько времени проходит между действием пользователя (клик, переход) и результатом (контент виден, UI интерактивен).

### Процесс и метрика

**Процесс** — это пользовательский сценарий от начала до конца: открытие карточки, загрузка списка, поиск. Каждый процесс — это одна метрика с именем (например, `card:open`, `space:load`).

Процесс начинается с действия пользователя и заканчивается, когда UI полностью готов к взаимодействию. Внутри процесс разбит на фазы.

### Фазы

Фаза — это измеримый отрезок внутри процесса. Стандартный набор фаз:

| Фаза | Что измеряем | Пояснение |
|---|---|---|
| `intent:to_handler` *(опц.)* | DOM-событие → JS-обработчик | Индикатор заблокированного main thread. >50ms — где-то тяжёлый синхронный код |
| `optimistic:to_visible` | Скелетон виден пользователю | Воспринимаемая отзывчивость. Цель: <100ms |
| `network:ttfb` | Time to First Byte | Время обработки на бэкенде |
| `network:total` | Полное время ответа | Разность с ttfb показывает проблему с размером payload |
| `render:full_content` | Контент отрисован | Виден, но может ещё не реагировать на действия |
| `render:interactive` | UI интерактивен | Все useEffect/componentDidMount выполнены, обработчики навешаны |
| `render:rollback` *(опц.)* | Откат при ошибке | Для оптимистичных обновлений — как быстро UI вернулся в консистентное состояние |
| `total` | E2E длительность | Полное время от начала до конца процесса |

Производная метрика `render:hydration_lag` = `render:interactive` − `render:full_content` — считается на стороне хранилища.

Если метрика использует все стандартные фазы — в каталоге она помечена как «Стандартные фазы». Отклонения описаны явно.

### Таймлайн процесса

```
click        skeleton      TTFB      response     content      interactive
  │              │           │           │            │              │
  start()        optimistic  network:    network:     render:        render:
                 :to_visible ttfb        total        full_content   interactive
  ├──────────────────────────────────────────────────────────────────┤
                                  total
```

Каждая фаза записывается с `value` (длительность или время от старта) и `offsetStart`/`offsetEnd` (положение на таймлайне относительно начала процесса).

### Теги

К метрике можно прикрепить теги для группировки и фильтрации:

```js
new MetricsCollector('space:load', { view: 'board' });
new MetricsCollector('card:move', { method: 'dnd' });
```

---

## Буфер метрик (MetricsBuffer)

MetricsBuffer — это внутренний транспортный механизм, скрытый за MetricsCollector. Разработчику компонентов не нужно о нём знать, настраивать его или взаимодействовать с ним напрямую. Все вызовы коллектора (`mark`, `end`, `recordNetwork`) автоматически складывают события в буфер, а буфер сам решает, когда и как их отправить.

Информация ниже — для понимания того, что происходит «под капотом».

### Как работает

1. Каждый замер (`mark`, `end`, `recordNetwork`) автоматически добавляет событие в буфер
2. Буфер хранит события в массиве до момента отправки
3. Отправка происходит автоматически в трёх случаях:
   - **По лимиту** — при накоплении 500 событий (защита от переполнения памяти)
   - **По таймеру** — каждые 10 секунд (в проде будет 5 минут)
   - **При закрытии вкладки** — по событию `visibilitychange`, когда `document.visibilityState === 'hidden'`
4. Отправка через `navigator.sendBeacon()` — надёжная доставка даже при закрытии вкладки

### Формат события

```js
{
  metric: 'card:open',           // имя процесса
  phase:  'render:full_content', // имя фазы
  value:  850,                   // длительность в ms
  offsetStart: 200,              // начало фазы от старта процесса (для start/end)
  offsetEnd: 850,                // конец фазы от старта процесса (для start/end)
  tags: { view: 'board' },       // теги
  ts: 1774439097184              // timestamp отправки
}
```

Для `mark()` вместо `offsetStart`/`offsetEnd` записывается только `value` — время от `start()` процесса до метки.

### Серверная сторона

Сервер получает пачку событий и раскладывает в два хранилища:
- **ClickHouse** — сырые события для ad-hoc анализа
- **Prometheus** — агрегированные гистограммы для дашбордов и алертов

Бакеты гистограмм: `[50, 100, 200, 500, 1000, 2000, 5000]` ms.

Клиент не агрегирует данные — отправляет сырые события. Вся агрегация на сервере.

---

## Архитектура системы сбора

Система метрик состоит из трёх слоёв:

1. **MetricsCollector** — замеряет тайминги через `performance.now()`, хранит состояние в приватных полях экземпляра
2. **MetricsProcess / MetricsContext** — пробрасывает коллектор через React-дерево
3. **PhaseMark** — декларативная обёртка, автоматически фиксирует render-фазы

Принцип разделения:
- **Render-фазы** (optimistic, fullContent, interactive) — декларативно через `<PhaseMark>` в JSX
- **Императивные фазы** (network, intent, кастомные) — через методы коллектора в JS

---

## 1. Старт процесса

Процесс начинается в обработчике действия пользователя. Два шага:

1. **Создать коллектор и запустить отсчёт** — в обработчике клика / перехода
2. **Обернуть отслеживаемый компонент в `<MetricsProcess>`** — чтобы коллектор был доступен внутри

### MetricsProcess

`<MetricsProcess>` — это React-обёртка, которая определяет границу отслеживаемого процесса. Она принимает коллектор через проп `collector` и делает его доступным для всех дочерних компонентов через React Context. Все `<PhaseMark>`, вызовы `useMetrics()` и `this.context` внутри этой обёртки будут работать с переданным коллектором.

Без `<MetricsProcess>` метрики не собираются — `<PhaseMark>` и хуки получат `null` и молча ничего не сделают.

```jsx
import { MetricsCollector } from './metrics/MetricsCollector';
import { MetricsProcess } from './metrics/MetricsContext';

// в обработчике клика
const collector = new MetricsCollector('card:open');
collector.start();

// обернуть отслеживаемый компонент
<MetricsProcess collector={collector}>
  <Modal />   {/* всё внутри имеет доступ к коллектору */}
</MetricsProcess>
```

`<MetricsProcess>` можно размещать на любом уровне дерева — оборачивать всё приложение, отдельную страницу или конкретный компонент. Главное — чтобы обёртка покрывала все компоненты, участвующие в замеряемом процессе.

### Вложенные процессы

`<MetricsProcess>` можно вкладывать друг в друга. Работает стандартное правило React Context: дочерние компоненты получают коллектор от **ближайшего** `<MetricsProcess>` вверх по дереву.

Это позволяет запускать независимые процессы внутри уже отслеживаемого. Например, пользователь открыл карточку, а затем внутри неё нажал «загрузить историю» — это отдельный процесс со своим коллектором:

```jsx
<MetricsProcess collector={cardOpenCollector}>
  {/* card:open — всё здесь пишется в cardOpenCollector */}
  <CardContent data={data} />

  <MetricsProcess collector={historyCollector}>
    {/* card:history_load — здесь свой независимый таймлайн */}
    <PhaseMark key="skeleton" optimistic>
      <HistorySkeleton />
    </PhaseMark>
  </MetricsProcess>
</MetricsProcess>
```

Каждый процесс ведёт свой таймлайн, свои фазы и свой `total`. Они не мешают друг другу.

**Важно:** не оборачивайте один и тот же набор компонентов в два `<MetricsProcess>` для одного процесса. Если случайно продублировать обёртку, часть `<PhaseMark>` будет писать в один коллектор, часть — в другой, и таймлайн рассыпется.

### Теги

Второй аргумент конструктора — теги для группировки и фильтрации:

```js
const collector = new MetricsCollector('space:load', { view: 'board' });
```

---

## 2. Стандартные render-фазы через PhaseMark

`<PhaseMark>` — обёртка, которая автоматически фиксирует render-фазы. Компонент внутри не знает про метрики.

### Флаги

| Флаг | Фаза | Что фиксирует |
|---|---|---|
| `optimistic` | `optimistic:to_visible` | Скелетон/placeholder виден пользователю (после paint) |
| `fullContent` | `render:full_content` | Контент отрисован (после useEffect детей) |
| `interactive` | `render:interactive` | Компонент интерактивен (после paint, после всех эффектов) |
| `finish` | `total` | Завершает весь процесс (E2E метрика) |

### Важно: атрибут key

Если `<PhaseMark>` с разными флагами рендерится в одной позиции дерева (например, скелетон → контент через тернарный оператор), **обязательно укажите разные `key`**. Иначе React переиспользует экземпляр, и внутренние ref'ы не сбросятся.

### Использование одинаково для функциональных и классовых компонентов

PhaseMark — это обёртка в JSX. Неважно, что внутри — функциональный или классовый компонент:

```jsx
// Скелетон — появился placeholder
<PhaseMark key="skeleton" optimistic>
  <MySkeleton />
</PhaseMark>

// Контент отрисован
<PhaseMark key="content" fullContent>
  <MyContent data={data} />
</PhaseMark>

// Контент + интерактивность + завершение процесса
<PhaseMark key="content" fullContent interactive finish>
  <MyContent data={data} />
</PhaseMark>
```

### Типичный паттерн: скелетон → контент

```jsx
{data ? (
  <PhaseMark key="content" fullContent>
    <MyContent data={data} />
  </PhaseMark>
) : (
  <PhaseMark key="skeleton" optimistic>
    <MySkeleton />
  </PhaseMark>
)}
```

### Отложенная интерактивность

Если компонент становится интерактивным не сразу (например, ждёт дополнительных данных), вынесите `interactive` в отдельный `<PhaseMark>`, который монтируется после загрузки:

```jsx
{extra ? (
  <PhaseMark key="interactive" interactive finish>
    <ExtraContent data={extra} />
  </PhaseMark>
) : (
  <p>Loading...</p>
)}
```

---

## 3. Доступ к коллектору из компонента

Для императивных замеров (сеть, кастомные фазы) нужен доступ к коллектору.

### Функциональные компоненты — хук `useMetrics()`

```jsx
import { useMetrics } from './metrics/MetricsContext';

function MyComponent() {
  const collector = useMetrics();

  useEffect(() => {
    collector?.start('my_phase');
    doSomething();
    collector?.end('my_phase');
  }, []);
}
```

### Классовые компоненты — `static contextType`

```jsx
import { MetricsContext } from './metrics/MetricsContext';

class MyComponent extends Component {
  static contextType = MetricsContext;

  componentDidMount() {
    const collector = this.context;
    collector?.start('my_phase');
    doSomething();
    collector?.end('my_phase');
  }
}
```

---

## 4. Замер сетевых запросов

`recordNetwork(url, phase)` автоматически извлекает тайминги из PerformanceResourceTiming API. Вызывайте после получения ответа:

```js
// Функциональный
const collector = useMetrics();

useEffect(() => {
  fetch(URL)
    .then(res => {
      collector?.recordNetwork(URL);        // запишет network:ttfb и network:total
      return res.json();
    });
}, []);

// Классовый
componentDidMount() {
  const collector = this.context;

  fetch(URL)
    .then(res => {
      collector?.recordNetwork(URL);
      return res.json();
    });
}
```

Второй аргумент — префикс фазы (по умолчанию `'network'`):

```js
collector?.recordNetwork(EXTRA_URL, 'network_extra');
// запишет: network_extra:ttfb, network_extra:total
```

---

## 5. Кастомные метрики

### mark(phase) — точка на таймлайне от начала процесса

Фиксирует, сколько прошло от `collector.start()` до текущего момента. Не требует парного вызова.

```js
// "через 500ms после старта процесса пользователь увидел первый элемент списка"
collector?.mark('first_item_visible');
```

Результат: `{ phase: 'first_item_visible', value: 500 }`

### start(phase) / end(phase) — произвольный отрезок

Измеряет длительность между двумя точками. Не привязан к старту процесса, записывает `offsetStart` и `offsetEnd` относительно `collector.start()`.

```js
collector?.start('heavy_computation');
const result = processLargeDataset(data);
collector?.end('heavy_computation');
```

Результат: `{ phase: 'heavy_computation', value: 120, offsetStart: 500, offsetEnd: 620 }`

### Когда что использовать

| Задача | Метод |
|---|---|
| «Сколько от клика до X» | `mark(phase)` |
| «Сколько длился конкретный этап» | `start(phase)` + `end(phase)` |
| «Сколько занял сетевой запрос» | `recordNetwork(url)` |
| «Когда компонент стал виден» | `<PhaseMark>` |

---

## 6. Завершение процесса

Процесс завершается одним из двух способов:

1. **Через PhaseMark** — флаг `finish` вызывает `collector.end()` после последней фазы
2. **Императивно** — `collector.end()` в коде

```jsx
// Декларативно — после render:interactive
<PhaseMark interactive finish>
  <MyContent />
</PhaseMark>

// Императивно
collector?.end();
```

`end()` без аргументов записывает фазу `total` — полное время от `start()` до `end()`.

---

## Сводная таблица: функциональные vs классовые компоненты

| Действие | Функциональный | Классовый |
|---|---|---|
| Получить коллектор | `const c = useMetrics()` | `const c = this.context` (+ `static contextType = MetricsContext`) |
| Вызов при монтировании | `useEffect(() => { ... }, [])` | `componentDidMount() { ... }` |
| Очистка при размонтировании | return в `useEffect` | `componentWillUnmount()` |
| PhaseMark в JSX | Одинаково | Одинаково |
| recordNetwork | Одинаково | Одинаково |
| mark / start / end | Одинаково | Одинаково |

Единственное отличие — способ получения коллектора из контекста. Вся остальная работа с метриками идентична.
