/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 报表的俄语语言包。

import type { XhConfig } from '@xihan-ui/web-components'
import type { ReportDesignerLocale } from '../designer-translations'
import { designerShellRuRU } from '@xihan-ui/designer-shell/locale'
import { reportLocale } from './types'

// 名词随数量取形：个位 1（11 除外）取单数，个位 2–4（12–14 除外）取少数，其余取多数。
function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11)
    return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    return few
  return many
}

const TYPE_NAMES: Readonly<Record<string, string>> = {
  string: 'текст',
  number: 'число',
  boolean: 'логическое значение',
  date: 'дата',
  datetime: 'дата и время',
  object: 'объект',
  array: 'массив',
}

const OPERATOR_NAMES: Readonly<Record<string, string>> = {
  eq: 'равно',
  neq: 'не равно',
  gt: 'больше',
  gte: 'не меньше',
  lt: 'меньше',
  lte: 'не больше',
  between: 'между',
  in: 'в списке',
  notIn: 'не в списке',
  contains: 'содержит',
  notContains: 'не содержит',
  startsWith: 'начинается с',
  endsWith: 'заканчивается на',
  isEmpty: 'пусто',
  isNotEmpty: 'не пусто',
}

const OPTION_LABELS: ReportDesignerLocale['optionLabels'] = {
  'none': 'Нет',
  'auto': 'Авто',
  'start': 'К началу',
  'center': 'По центру',
  'end': 'К концу',
  'inside': 'Внутри',
  'outside': 'Снаружи',
  'vertical': 'Вертикальная',
  'horizontal': 'Горизонтальная',
  'asc': 'По возрастанию',
  'desc': 'По убыванию',
  'ascending': 'По возрастанию',
  'descending': 'По убыванию',
  'first': 'В начале',
  'last': 'В конце',
  'sum': 'Сумма',
  'avg': 'Среднее',
  'count': 'Количество',
  'min': 'Минимум',
  'max': 'Максимум',
  'distinctCount': 'Число уникальных',
  'year': 'Год',
  'quarter': 'Квартал',
  'month': 'Месяц',
  'week': 'Неделя',
  'day': 'День',
  'hour': 'Час',
  'string': 'Текст',
  'number': 'Число',
  'boolean': 'Логическое значение',
  'date': 'Дата',
  'datetime': 'Дата и время',
  'bar': 'Столбцы',
  'line': 'Линия',
  'scatter': 'Точки',
  'pie': 'Круговая диаграмма',
  'donut': 'Кольцевая диаграмма',
  'full': 'Полный круг',
  'half': 'Полукруг',
  'name': 'Название',
  'share': 'Доля',
  'value': 'Значение',
  'name-share': 'Название и доля',
  'name-value': 'Название и значение',
  'trapezoid': 'Трапеция',
  'previous': 'От предыдущего этапа',
  'up': 'Вверх',
  'down': 'Вниз',
  'polygon': 'Многоугольник',
  'circle': 'Круг',
  'shared': 'Общая шкала',
  'independent': 'Отдельные шкалы',
  'calendar': 'Календарь',
  'matrix': 'Матрица',
  'sequential': 'Последовательная',
  'diverging': 'Расходящаяся',
  'treemap': 'Древовидная карта',
  'sunburst': 'Солнечные лучи',
  'icicle': 'Сосульки',
  'pack': 'Упаковка кругов',
  'columns': 'Столбцы',
  'rows': 'Строки',
  'axis': 'Вся ось',
  'item': 'Одна точка',
  'series': 'По рядам',
  'lollipop': 'Леденец',
  'expand': 'В процентах',
  'linear': 'Прямая',
  'monotone': 'Сглаженная',
  'step': 'Ступенчатая',
  'always': 'Всегда',
  'sm': 'Маленький',
  'md': 'Средний',
  'lg': 'Большой',
  'brand': 'Фирменный',
  'neutral': 'Нейтральный',
  'success': 'Успех',
  'warning': 'Предупреждение',
  'danger': 'Опасность',
  'info': 'Информация',
  'measuresOn=columns': 'В столбцах',
  'measuresOn=rows': 'В строках',
  'conversion=first': 'От первого этапа',
  'labels=end': 'В конце',
}

/** 问题参数里的名字写成 «名字»，前面带一个空格，拼在名词后面；没有时为空串。 */
function quoted(value: unknown): string {
  return value === undefined || value === null ? '' : ` «${String(value)}»`
}

/** 类型名：可以是 a|b 写法的几种之一。 */
function typeName(value: unknown): string {
  return String(value).split('|').map(item => TYPE_NAMES[item] ?? item).join(' или ')
}

function operatorName(value: unknown): string {
  return OPERATOR_NAMES[String(value)] ?? String(value)
}

/** 选项的名字，如聚合方式；不在对照表里的原样写出。 */
function optionName(value: unknown): string {
  return (OPTION_LABELS as Readonly<Record<string, string | undefined>>)[String(value)] ?? String(value)
}

/** 取值范围：min、max 与 exclusiveMin。 */
function range(params: Readonly<Record<string, unknown>>): string {
  const parts = [
    params.min === undefined ? undefined : `не меньше ${String(params.min)}`,
    params.exclusiveMin === undefined ? undefined : `больше ${String(params.exclusiveMin)}`,
    params.max === undefined ? undefined : `не больше ${String(params.max)}`,
  ].filter(part => part !== undefined)
  return parts.length === 0 ? '' : `: должно быть ${parts.join(' и ')}`
}

const designer: ReportDesignerLocale = {
  label: 'Конструктор отчётов',
  canvas: 'Холст',
  datasets: 'Наборы данных',
  parameters: 'Параметры отчёта',
  wells: 'Поля',
  lists: {
    dimensions: 'Измерения',
    measures: 'Меры',
    series: 'Ряды',
    rows: 'Строки',
    columns: 'Столбцы',
    groups: 'Группы',
    tableColumns: 'Столбцы',
  },
  palette: 'Элементы',
  properties: 'Свойства',
  issues: 'Проблемы',
  datasetsHelp: 'Наборы данных и поля этого отчёта. Перетащите поле на карточку или в список полей; выберите его, чтобы изменить название, тип и формулу в свойствах.',
  parametersHelp: 'Параметры отчёта заполняются над отчётом, а в фильтрах и формулах на них ссылаются по имени.',
  paletteHelp: 'Диаграммы, показатели и таблицы. Перетащите элемент на дашборд или щёлкните по нему, чтобы поставить его на первое свободное место.',
  wellsHelp: 'Измерения, меры, ряды и столбцы выбранной карточки. Перетаскивайте сюда поля, меняйте их порядок перетаскиванием и удаляйте крестиком.',
  propertiesHelp: 'Свойства выбранного объекта. Если выбрано несколько карточек, показаны только их общие свойства.',
  issuesHelp: 'Ошибки проверки отчёта. Выберите одну, чтобы выделить объект, к которому она относится.',
  selectionToolbar: 'Выбранные карточки',
  sizeUnit: 'яч.',
  importDataset: 'Импорт набора данных',
  importParameters: 'Импорт параметров',
  importTemplate: 'Импорт шаблона',
  menuData: 'Данные',
  tourSteps: {
    datasets: { title: 'Данные', description: 'Наборы данных с их полями и параметры отчёта. Перетащите поле на карточку, чтобы показать его в ней.' },
    wells: { title: 'Поля', description: 'Что показывает выбранная карточка: измерения, меры, ряды или столбцы. Перетаскивайте поля сюда, меняйте порядок перетаскиванием и убирайте их кнопкой ×.' },
    cards: { title: 'Карточки', description: 'Перетащите карточку, чтобы переместить её, и её края, чтобы изменить размер; она выравнивается по сетке. Когда карточка выбрана, панель над ней копирует или удаляет её, а значок под ней показывает размер в ячейках.' },
    links: { title: 'Связи', description: 'Под полями выбранной карточки свяжите её с другими карточками. Щелчок по значению в этой карточке отфильтрует связанные карточки по нему.' },
    preview: { title: 'Предпросмотр', description: 'Запустите отчёт с данными и параметрами и посмотрите, как его увидят пользователи.' },
  },
  helpNotes: [
    'Перетащите поля из панели данных на карточку или в её поля, чтобы выбрать, что показывает карточка. Числовые поля становятся мерами, остальные — измерениями.',
    'На дашборде перетаскивайте карточки, чтобы перемещать их, и их края, чтобы менять размер; они выравниваются по сетке. Значок размера под выбранной карточкой меняет её ширину и высоту в ячейках.',
    'Переключитесь в предпросмотр, чтобы запустить отчёт с данными и параметрами. Нажмите Ctrl+S (⌘S в macOS), чтобы сохранить; где хранится отчёт, решает система, в которой вы его используете.',
  ],
  shortcutResize: 'Увеличить или уменьшить выбранную карточку на одну ячейку',
  statusDocument: (datasets, cards) => `${datasets} ${plural(datasets, 'набор данных', 'набора данных', 'наборов данных')}${cards === undefined ? '' : ` · ${cards} ${plural(cards, 'карточка', 'карточки', 'карточек')}`}`,
  statusCell: (column, row, width, height) => `Столбец ${column}, строка ${row} · ${width} × ${height}`,
  statusZoom: 'Масштаб',
  issueTexts: {
    'required': () => 'Значение обязательно',
    'invalid-type': p => p.expected === undefined ? 'Неверный тип' : `Неверный тип: ожидается ${typeName(p.expected)}`,
    'invalid-value': (p) => {
      if (p.min !== undefined && p.max !== undefined)
        return p.min === p.max ? `Недопустимое значение: нужно указать ${String(p.min)} ${plural(Number(p.min), 'элемент', 'элемента', 'элементов')}` : `Недопустимое значение: нужно указать от ${String(p.min)} до ${String(p.max)} ${plural(Number(p.max), 'элемента', 'элементов', 'элементов')}`
      return p.expected === undefined ? 'Недопустимое значение' : `Недопустимое значение: ожидается ${String(p.expected)}`
    },
    'out-of-range': p => `Значение вне допустимого диапазона${range(p)}`,
    'not-integer': () => 'Должно быть целым числом',
    'invalid-option': () => 'Значение не входит в число допустимых',
    'invalid-color': () => 'Недопустимый цвет',
    'empty': () => 'Значение не может быть пустым',
    'unknown-key': p => p.key === undefined ? 'Неизвестный ключ' : `Неизвестное имя${quoted(p.key)}`,
    'unknown-control': () => 'Неизвестный тип редактора',
    'duplicate-key': p => `Имя${quoted(p.key)} повторяется`,
    'duplicate-id': p => `Идентификатор${quoted(p.id)} повторяется`,
    'duplicate-value': () => 'Повторяющееся значение варианта',
    'aggregate-type-mismatch': p => `«${optionName(p.aggregate)}» применяется только к числовым полям; тип этого поля — ${typeName(p.type)}`,
    'bucket-type-mismatch': p => `Группировка дат применяется только к полям с датами; тип этого поля — ${typeName(p.type)}`,
    'chart-reference-role': p => `Ключ${quoted(p.key)} должен ссылаться на ${p.expected === 'dimension' ? 'измерение' : 'меру'}`,
    'format-invalid': () => 'Недопустимый формат',
    'formula-cycle': p => `Формулы циклически ссылаются друг на друга: ${String(p.names ?? '').split(',').join(' → ')}`,
    'formula-invalid': () => 'Не удалось разобрать формулу',
    'formula-unknown-reference': p => `Формула ссылается на неизвестное имя${quoted(p.name)}`,
    'layout-out-of-bounds': p => `Карточка выходит за пределы сетки из ${String(p.columns)} ${plural(Number(p.columns), 'столбца', 'столбцов', 'столбцов')}`,
    'layout-overlap': p => `Карточка перекрывает карточку${quoted(p.card)}`,
    'link-target-type-mismatch': p => `Исходное измерение группируется по датам, поэтому целевое поле тоже должно быть датой; тип этого поля — ${typeName(p.type)}`,
    'measure-definition': () => 'Для меры укажите либо агрегирование, либо формулу, но не то и другое',
    'operand-required': () => 'Не указано значение для сравнения',
    'operand-shape': (p) => {
      if (p.operator === 'between')
        return 'Для оператора «между» нужны два значения'
      if (p.operator === 'in' || p.operator === 'notIn')
        return `Для оператора «${operatorName(p.operator)}» нужен список значений`
      return p.operator === undefined ? 'Здесь допускается только одно значение' : `Для оператора «${operatorName(p.operator)}» нужно одно значение`
    },
    'operand-type-mismatch': p => `Значение для сравнения должно быть типа «${typeName(p.expected)}»`,
    'operator-type-mismatch': p => `Оператор «${operatorName(p.operator)}» неприменим к полям типа «${typeName(p.type)}»`,
    'reserved-name': p => `Имя${quoted(p.key)} начинается с $; такие имена зарезервированы для параметров отчёта в формулах`,
    'unknown-card': p => `Карточка${quoted(p.card)} не найдена`,
    'unknown-dataset': p => `Набор данных${quoted(p.dataset)} не найден`,
    'unknown-dataset-parameter': p => `В наборе данных нет параметра${quoted(p.parameter)}`,
    'unknown-dimension': p => `Измерение${quoted(p.key)} не найдено`,
    'unknown-field': p => `Поле${quoted(p.field)} не найдено`,
    'unknown-kind': p => `Тип${quoted(p.kind)} не зарегистрирован; установите расширение, которое его регистрирует`,
    'unknown-measure': p => `Мера${quoted(p.key)} не найдена`,
    'unknown-parameter': p => `Параметр${quoted(p.parameter)} не найден`,
    'unknown-series': p => `Ряд${quoted(p.series)} не найден`,
    'unsupported-schema-version': p => `Версия отчёта ${String(p.version)} не поддерживается`,
    'parameter-required': () => 'Для этого параметра нужно указать значение',
    'parameter-type-mismatch': () => 'Значение параметра имеет неверный тип',
    'parameter-not-multiple': () => 'Этот параметр принимает только одно значение',
    'parameter-option-mismatch': () => 'Значение не входит в список вариантов',
  },
  paletteGroups: { charts: 'Диаграммы', metrics: 'Показатели', tables: 'Таблицы' },
  cardTypes: {
    'chart.cartesian': 'Столбцы и линии',
    'chart.pie': 'Круговая диаграмма',
    'chart.funnel': 'Воронка',
    'chart.radar': 'Лепестковая диаграмма',
    'chart.sankey': 'Диаграмма Санки',
    'chart.heatmap': 'Тепловая карта',
    'chart.hierarchy': 'Иерархическая диаграмма',
    'metric': 'Показатель',
    'table.table': 'Подробная таблица',
    'table.group': 'Отчёт с группировкой',
    'table.crosstab': 'Перекрёстная таблица',
  },
  objectKinds: {
    document: 'Отчёт',
    dashboard: 'Дашборд',
    dataset: 'Набор данных',
    card: 'Карточка',
    chart: 'Диаграмма',
    metric: 'Показатель',
    view: 'Представление',
    dimension: 'Измерение',
    measure: 'Мера',
    column: 'Столбец',
    group: 'Группа',
    series: 'Ряд',
    field: 'Поле',
    parameter: 'Параметр',
    link: 'Связь',
  },
  propertyGroups: { basic: 'Основные', data: 'Данные', display: 'Отображение', axis: 'Оси', style: 'Стиль', interaction: 'Взаимодействие', totals: 'Итоги', sparkline: 'Спарклайн' },
  propertyLabels: {
    'title': 'Заголовок',
    'description': 'Описание',
    'grid.columns': 'Число столбцов',
    'grid.rowHeight': 'Высота строки',
    'dataset': 'Набор данных',
    'parameters': 'Привязка параметров',
    'filter': 'Фильтр',
    'query.filter': 'Фильтр',
    'query.limit': 'Максимум строк',
    'limit': 'Максимум строк',
    'sort': 'Сортировка',
    'detail': 'Показывать подробные строки',
    'grandTotal': 'Общий итог',
    'measuresOn': 'Расположение мер',
    'rowTotals.subtotals': 'Промежуточные итоги по строкам',
    'rowTotals.grandTotal': 'Общий итог по строкам',
    'columnTotals.subtotals': 'Промежуточные итоги по столбцам',
    'columnTotals.grandTotal': 'Общий итог по столбцам',
    'splitBy': 'Разбить на ряды по',
    'orientation': 'Ориентация',
    'totals': 'Показывать итоги',
    'palette': 'Палитра',
    'renderer': 'Способ отрисовки',
    'xAxis.title': 'Название оси X',
    'xAxis.scale': 'Шкала оси X',
    'xAxis.format': 'Формат оси X',
    'xAxis.grid': 'Линии сетки оси X',
    'xAxis.zero': 'Включать ноль по оси X',
    'xAxis.nice': 'Округлять диапазон оси X',
    'xAxis.reverse': 'Обратный порядок оси X',
    'xAxis.ticks': 'Число делений оси X',
    'xAxis.labelOverflow': 'Длинные подписи оси X',
    'yAxis.title': 'Название оси Y',
    'yAxis.scale': 'Шкала оси Y',
    'yAxis.format': 'Формат оси Y',
    'yAxis.grid': 'Линии сетки оси Y',
    'yAxis.zero': 'Включать ноль по оси Y',
    'yAxis.nice': 'Округлять диапазон оси Y',
    'yAxis.reverse': 'Обратный порядок оси Y',
    'yAxis.ticks': 'Число делений оси Y',
    'yAxis.labelOverflow': 'Длинные подписи оси Y',
    'trigger': 'Показ подсказки',
    'tooltipOrder': 'Порядок в подсказке',
    'zoom': 'Масштаб',
    'brush': 'Выделение области',
    'annotations': 'Аннотации',
    'nameField': 'Измерение названий',
    'valueField': 'Мера значений',
    'variant': 'Вид',
    'rose': 'Диаграмма-роза',
    'sweep': 'Охват',
    'maxSlices': 'Максимум секторов',
    'labels': 'Подписи',
    'labelContent': 'Содержимое подписей',
    'format': 'Формат',
    'shape': 'Форма',
    'align': 'Выравнивание',
    'direction': 'Направление',
    'conversion': 'Конверсия',
    'indicators': 'Показатели',
    'area': 'Заливка области',
    'scale': 'Шкала',
    'curve': 'Линия',
    'rings': 'Число колец',
    'ringLabels': 'Подписи колец',
    'sourceField': 'Исходное измерение',
    'targetField': 'Целевое измерение',
    'nodeAlign': 'Выравнивание узлов',
    'linkColor': 'Цвет потоков',
    'nodeSort': 'Порядок узлов',
    'dateField': 'Измерение даты',
    'startDate': 'Дата начала',
    'endDate': 'Дата окончания',
    'firstDayOfWeek': 'Первый день недели',
    'rowField': 'Измерение строк',
    'columnField': 'Измерение столбцов',
    'levels': 'Уровни',
    'thresholds': 'Пороги',
    'midpoint': 'Средняя точка',
    'continuous': 'Непрерывная шкала',
    'tone': 'Тон',
    'size': 'Размер',
    'layout': 'Макет',
    'tile': 'Разбиение',
    'depth': 'Глубина раскрытия',
    'colorBy': 'Цвет по',
    'mark': 'Метка',
    'name': 'Название',
    'x': 'X',
    'y': 'Y',
    'color': 'Мера цвета',
    'stack': 'Группа накопления',
    'stackOffset': 'Накопление',
    'symbols': 'Точки данных',
    'connectNulls': 'Соединять пропуски',
    'endLabel': 'Подпись в конце',
    'symbol': 'Форма точки',
    'jitter': 'Разброс',
    'slot': 'Цветовой слот',
    'value': 'Значение',
    'baseline': 'Опорное значение',
    'prefix': 'Префикс',
    'suffix': 'Суффикс',
    'sparkline.x': 'X спарклайна',
    'sparkline.y': 'Значение спарклайна',
    'sparkline.variant': 'Вид спарклайна',
    'sparkline.curve': 'Линия спарклайна',
    'sparkline.markers': 'Маркеры спарклайна',
    'sparkline.tone': 'Тон спарклайна',
    'field': 'Поле',
    'width': 'Ширина столбца',
    'sticky': 'Закрепление',
    'summary.aggregate': 'Итог',
    'summary.formula': 'Формула итога',
    'bucket': 'Группировка дат',
    'sort.by': 'Сортировать по',
    'sort.direction': 'Направление сортировки',
    'sort.nulls': 'Пустые значения',
    'header': 'Заголовок группы',
    'subtotal': 'Промежуточный итог группы',
    'aggregate': 'Агрегирование',
    'formula': 'Формула',
    'type': 'Тип',
    'required': 'Обязательный',
    'multiple': 'Множественный выбор',
    'defaultValue': 'Значение по умолчанию',
    'options': 'Варианты',
    'card': 'Исходная карточка',
    'dimension': 'Исходное измерение',
    'targets': 'Целевые карточки',
    'series:size': 'Размер пузырьков',
    'measure:field': 'Поле',
  },
  optionLabels: OPTION_LABELS,
  selected: count => `Выбрано: ${count}`,
  emptyDashboard: 'Перетащите сюда диаграмму, показатель или таблицу',
  links: 'Связи',
  addLink: 'Добавить связь',
  linkLabel: (dimension, targets) => `${dimension} → ${targets} ${plural(targets, 'карточка', 'карточки', 'карточек')}`,
  wellsEmpty: 'Выберите карточку, чтобы изменить её поля',
  emptyList: 'Перетащите поля сюда',
  placeholder: 'Пример данных появится здесь после подключения поставщика данных',
  addDataset: 'Добавить набор данных',
  addField: 'Добавить поле',
  addParameter: 'Добавить параметр',
  removeTitle: name => `Удалить «${name}»`,
  removeCascade: (cascade) => {
    const parts = [
      [cascade.items, 'элемент списка', 'элемента списка', 'элементов списка'],
      [cascade.conditions, 'условие фильтра', 'условия фильтра', 'условий фильтра'],
      [cascade.sorts, 'правило сортировки', 'правила сортировки', 'правил сортировки'],
      [cascade.links, 'цель связи', 'цели связи', 'целей связи'],
      [cascade.bindings, 'привязка параметра', 'привязки параметра', 'привязок параметра'],
    ] as const
    return `Также будут удалены: ${parts.filter(([count]) => count > 0).map(([count, one, few, many]) => `${count} ${plural(count, one, few, many)}`).join(', ')}. Это можно отменить.`
  },
  removeConfirm: 'Удалить',
  historyStep: (step) => {
    const kind = step.kind.toLocaleLowerCase('ru')
    const target = step.count > 1 ? `${kind} × ${step.count}` : step.name === undefined ? kind : `${kind} «${step.name}»`
    switch (step.action) {
      case 'add':
        return `Добавление: ${target}`
      case 'remove':
        return step.cascade ? `Удаление: ${target} и ${step.cascade} ${plural(step.cascade, 'ссылка', 'ссылки', 'ссылок')}` : `Удаление: ${target}`
      case 'move':
        return `Перемещение: ${target}`
      case 'rename':
        return `Переименование: ${kind} «${step.name}» → «${step.to}»`
      case 'layout':
        return `Изменение расположения: ${target}`
      case 'replace':
        return `Замена: ${target}`
      case 'update':
        return step.property === undefined ? `Изменение: ${target}` : `Изменение: ${target}, ${step.property.toLocaleLowerCase('ru')}`
    }
  },
  unknownIssue: code => `Проблема: ${code}`,
}

/** 报表的俄语文案：查看器、设计器与 designer-shell 零件。 */
export const reportRuRU: XhConfig = reportLocale(designerShellRuRU, {
  viewer: {
    label: 'Отчёт',
    loading: 'Загрузка…',
    empty: 'Нет данных',
    error: 'Не удалось загрузить данные',
    invalid: 'Определение отчёта содержит ошибки, отчёт нельзя показать',
    parametersInvalid: 'Параметры отчёта не указаны или имеют недопустимые значения',
    total: 'Итого',
    subtotal: 'Промежуточный итог',
    missing: '(пусто)',
    parameters: 'Параметры отчёта',
    clearSelections: 'Сбросить выбор',
    exportXlsx: 'Книга Excel',
  },
  designer,
})
