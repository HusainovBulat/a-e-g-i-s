# A.E.G.I.S. Core ML & Physiological Engine (predict_all.py)
**Autonomous EVA Gait, Ischemia & Survival System · NASA Space Apps Challenge 2026**  
*Авторы модуля: Георгий (ML Engineer) & Костя (Lead / AI Core Architecture)*

---

## 1. Обзор и назначение (`Overview`)

Модуль [`predict_all.py`](./predict_all.py) — это центральный детерминированный пайплайн физиологического мониторинга и выживания космонавтов во время внекорабельной деятельности (EVA) и нахождения на лунной/марсианской базе.

### Главная задача модуля:
1. **Предотвращение гибели от удушья в кратере (Walk-Back & Point of No Return):** динамический расчет точки невозврата с учетом пройденного расстояния, нарастания усталости ног и расхода $O_2$.
2. **Предотвращение врачебных ошибок не-врача (Zero-Hallucination):** автоматическая жесткая блокировка нитроглицерина при гипотонии ($BP < 90\text{ мм рт. ст.}$) и немедленная подача $100\%\; O_2$ при сатурации $< 92\%$.
3. **Объективная оценка готовности (Mode 3 Masking):** выявление космонавтов, скрывающих усталость перед выходом в открытый космос.

---

## 2. Архитектура и компоненты пайплайна

Внутри [`predict_all.py`](./predict_all.py) объединены **три модели машинного обучения** и **три экспертно-клинических блока**:

```
                       ВХОДНАЯ ТЕЛЕМЕТРИЯ (1 Гц)
                       (Витальные датчики, майка Smart Base-Layer,
                        дистанция, радиоэфир, ползунки)
                                  │
         ┌────────────────────────┼────────────────────────┐
         ▼                        ▼                        ▼
  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
  │   MODEL A    │         │   MODEL B    │         │   MODEL C    │
  │ Myo-Fatigue  │         │ Metabolic &  │         │  Emergency   │
  │  (LightGBM)  │         │  Walk-Back   │         │    Triage    │
  │ + Fallback   │         │  (Apollo EVA)│         │(Tree + Rules)│
  └──────┬───────┘         └──────┬───────┘         └──────┬───────┘
         │                        │                        │
         │  Усталость ног (0..100)│                        │
         └───────────────────────►│                        │
                                  ▼                        │
                         Динамическая Точка                │
                             Невозврата                    │
                                  │                        │
         ┌────────────────────────┴────────────────────────┘
         ▼
  ┌────────────────────────────────────────────────────────┐
  │             КЛИНИЧЕСКИЙ БЛОК БЕЗОПАСНОСТИ              │
  │  • NASA-STD-3001 Hard Rules (Нитроглицерин / O₂ Surge) │
  │  • 6 органных систем (CNS, Cardio, Resp, Thermo...)    │
  │  • Voice Keyword NLP (парсинг радиоэфира EN / RU)      │
  │  • Mode 3 Masking Detector (Диссонанс самооценки)      │
  └───────────────────────────────┬────────────────────────┘
                                  ▼
                     ИТОГОВЫЙ JSON ВЫХОД (1 Гц)
                     (Health Score 0..100, Band 🟢/🟡/🔴,
                      таймеры возврата, шаги первой помощи)
```

### Модели в составе движка:
* **`Model A` (`model_a_full.pkl` / `model_a_fallback.pkl`):**
  * Монотонный регрессор LightGBM, обученный на датасетах PhysioNet SEMG и NIRS.
  * Оценивает усталость мышц ног (`fatigue_score 0..100`) и прогнозирует время до мышечного отказа/судорог (`time_to_failure_min`).
  * При отказе оптического сенсора (`nirs_ok = False`) автоматически переключается на дублирующую модель по EMG + походке.
* **`Model B` (`model_b_metabolic.pkl`):**
  * Монотонный регрессор LightGBM (уравнение Пандолфа под гравитацию $1/6\;g$), откалиброванный по эталонам Apollo 14–16 ($0^\circ, 10^\circ, 18^\circ$).
  * Считает метаболическую мощность в Ваттах и расход кислорода в л/мин.
* **`Model C` (`model_c_triage.pkl`):**
  * Классификатор LightGBM + суррогатное дерево решений (`DecisionTreeClassifier`), диагностирующее 5 классов экстренных состояний с генерацией понятного объяснения (`tree_path`).

---

## 3. Быстрый старт в Python коде (`Quickstart`)

### Базовый вызов всего пайплайна:
```python
from predict_all import predict_all

# Пакет телеметрии за 1 секунду (все ключи имеют гибкие алиасы)
telemetry = {
    "crew": "Crew_A",
    "distance_m": 1250.0,       # Дистанция от шлюза базы (в метрах)
    "speed": 2.5,               # Скорость ходьбы (км/ч)
    "slope": 5.0,               # Уклон рельефа (градусы)
    "o2_left": 580.0,           # Остаток кислорода в ранце PLSS (литры)
    "hr": 78.0,                 # Пульс (уд/мин)
    "sys": 118.0, "dia": 76.0,  # Артериальное давление (мм рт. ст.)
    "spo2": 98.4,               # Сатурация (%)
    "resp": 15.0,               # Частота дыхания (вдох/мин)
    "smo2": 78.5,               # Кислород в икроножной мышце SmO2 (%)
    "emg_mdf": -2.0,            # Сдвиг медианной частоты электромиограммы (%)
    "gait": 0.12,               # Асимметрия / шаткость походки IMU
    "st": 0.005,                # Сдвиг ST-сегмента ЭКГ (мВ)
    "temp": 36.7,               # Температура тела (°C)
    "blood_sugar_mgdl": 92.0,   # Сахар крови (mg/dL)
}

result = predict_all(telemetry)

print("Индекс здоровья:", result["health_score"])       # 96.8
print("Светофор:", result["band"])                      # GREEN / green
print("Время пути домой:", result["model_b"]["return_time_min"], "мин") # 30.5 мин
print("Запас до разворота:", result["model_b"]["walk_back_limit_min"], "мин")
print("Диагноз триажа:", result["model_c"]["primary_class"]) # Nominal
```

---

## 4. Как работает физиологическая логика

### 4.1. Динамический Walk-Back и Точка Невозврата (Model B)
Точка возврата не статична — она непрерывно пересчитывается каждую секунду:
1. **Замедление уставших ног:**
   $$v_{return} = \max\left(1.2,\; 2.5 \cdot \left(1.0 - 0.3 \cdot \frac{\text{fatigue}}{100}\right)\right)\text{ км/ч}$$
   Чем сильнее устали ноги в `Model A`, тем медленнее идет космонавт и тем больше времени займет обратная дорога.
2. **Время пути до шлюза:**
   $$t_{return} = \frac{\text{dist\_km}}{v_{return}} \cdot 60\text{ мин}$$
   Возвращается в полях `return_time_min` (число) и `return_time_display` (строка `"44:15"`).
3. **Расход кислорода на возврат:**
   Учитывает уклон подъема из кратера (`slope_return_deg`, по умолчанию плоский спуск $0^\circ$):
   $$O_{2,\text{return}} = t_{return} \cdot \text{burn\_rate}_{return}$$
4. **Запас времени движения вперед (`walk_back_limit_min`):**
   $$\text{usable\_o2} = \max(0,\; O_{2,\text{tank}} - 45\text{ л (резерв NASA)} - O_{2,\text{return}})$$
   $$\text{walk\_back\_limit\_min} = \frac{\text{usable\_o2}}{\text{burn\_rate}_{now}}$$
   * При $\le 15\text{ мин}$ $\rightarrow$ `point_of_no_return_warning = True` (уровень `"amber"`).
   * При $\le 5\text{ мин}$ $\rightarrow$ `critical_turn_back_now = True` (уровень `"red"`).

### 4.2. Жесткие клинические правила (NASA-STD-3001)
Модель `Model C` защищена от галлюцинаций медицинскими блокировками:
1. **Блокировка нитроглицерина:** если $BP_{\text{sys}} < 90\text{ мм рт. ст.}$, поле `dont_give_nitro = True`, а в протокол первым шагом добавляется красный баннер `⛔ DON'T GIVE NITROGLYCERIN!`.
2. **Кислородный триггер:** если $SpO_2 < 92\%$, поле `oxygen_surge = True`, первым шагом назначается маска $100\%\; O_2$.
3. **Вызов врачей Земли:** при подозрении на инфаркт миокарда или баротравму флаг `flight_surgeons_alert = True`.

### 4.3. Распознавание симптомов по радиоэфиру (Voice NLP)
Если в телеметрию передать текстовую расшифровку речи космонавта, например:
```python
result = predict_all({
    "transcript": "База, у меня сильная боль в груди и сильная одышка",
    "hr": 120, "sys": 84, "dia": 52, "spo2": 93.0
})
```
Функция `extract_voice_symptoms()` автоматически извлечет симптомы `chest_pain = True`, `short_breath = True`, а `Model C` мгновенно выдаст диагноз **`Acute Coronary Ischemia`** с запретом нитроглицерина из-за гипотонии.

### 4.4. 6 Органных систем ($0..100$)
Поле `organ_scores_6` содержит объективные оценки состояния органов космонавта:
* `cns`: ЦНС, сон, настроение, тремор походки.
* `cardio`: сердечно-сосудистая система (ЧСС, давление, элевация ST).
* `resp`: дыхательная система (SpO₂, частота дыхания).
* `thermo`: терморегуляция (температура тела $36.7^\circ\text{C}$).
* `metabolic`: метаболизм и глюкоза крови ($75..115\text{ мг/дл}$).
* `musculo`: скелетно-мышечная система (SmO₂, сдвиг MDF, утомление ног).

### 4.5. Mode 3: Детектор маскирования усталости (Masking)
Если космонавт передает вечерние субъективные оценки (0..10):
```python
result = predict_all({
    "sleep": 9.5, "energy": 9.5, "mood": 9.0, "pain_free": 9.0, "nutrition": 9.0, # Самооценка 92/100
    "hr": 125, "sys": 86, "dia": 55, "smo2": 38.0, "emg_mdf": -28.0             # Датчики: истощение
})
print(result["mode3_readiness"]["masking_detected"]) # True!
print(result["mode3_readiness"]["eva_clearance"])    # PROHIBITED!
```
Если расхождение $\ge 30$ баллов, система определяет попытку скрыть симптомы, отзывает допуск к выходу и уведомляет командира.

---

## 5. Входные ключи и поддерживаемые алиасы

Функция `_lookup()` в [`predict_all.py`](./predict_all.py) поддерживает любые общепринятые наименования параметров:

| Параметр | Поддерживаемые ключи и алиасы | Единицы | Дефолт |
| :--- | :--- | :--- | :--- |
| **Пульс** | `hr`, `hr_bpm`, `heart_rate` | уд/мин | `72.0` |
| **Давление сист.** | `bp_sys`, `sys`, `systolic_bp`, `bp_systolic` | мм рт. ст. | `120.0` |
| **Давление диаст.** | `bp_dia`, `dia`, `diastolic_bp`, `bp_diastolic` | мм рт. ст. | `76.0` |
| **Сатурация** | `spo2` | % | `98.0` |
| **Частота дыхания** | `resp_rate`, `resp`, `respiration_rate`, `respiration` | вдох/мин | `15.0` |
| **ЭКГ ST-сегмент** | `st_elevation_mv`, `st`, `st_segment`, `ecg_st` | мВ (или мм) | `0.0` |
| **Температура тела** | `temp`, `body_temp_c`, `temperature` | °C | `36.7` |
| **Сахар крови** | `blood_sugar_mgdl`, `blood_sugar` | mg/dL | `95.0` |
| **Кислород мышц** | `calf_smo2_pct`, `smo2`, `calf_smo2` | % | `75.0` |
| **Сдвиг частоты EMG**| `semg_mdf_shift_pct`, `emg_mdf`, `semg_mdf`, `mdf_shift` | % | `0.0` |
| **Шаткость походки**| `imu_gait_asymmetry`, `gait`, `gait_wobble`, `asymmetry` | 0..1 | `0.10` |
| **Скорость ходьбы** | `speed_kmh`, `speed`, `walking_speed` | км/ч | `2.5` |
| **Уклон рельефа**   | `slope_deg`, `slope`, `slope_angle`, `pitch` | градусы | `0.0` |
| **Дистанция от базы**| `distance_m`, `dist_m`, `distance`, `distance_from_base_m` | метры | `1800.0` |
| **Остаток O₂**     | `o2_tank_remaining_l`, `o2_left`, `o2_tank_l`, `tank_l` | литры | `650.0` |
| **Симптомы (флаги)**| `chest_pain`, `short_breath`, `dizzy`, `cold_sweat`, `fall_event` | 0 / 1 | `0` |
| **Радиоэфир**      | `transcript`, `text`, `speech` | строка | `""` |
| **Слайдеры (0..10)**| `sleep`, `energy`, `mood`, `pain_free`, `nutrition` | 0..10 | `8.0` |

---

## 6. Структура возвращаемого ответа (`JSON Schema`)

```json
{
  "crew_id": "Crew_A",
  "t": 0,
  "env": "surface_eva_spacesuit",
  "health_score": 97.5,
  "band": "GREEN",
  "traffic_light": "green",
  "composite_band": "green",
  "status_label": "🟢 NOMINAL",
  "organ_scores_6": {
    "cns": 84.0,
    "cardio": 100.0,
    "resp": 100.0,
    "thermo": 100.0,
    "metabolic": 100.0,
    "musculo": 100.0
  },
  "model_a": {
    "muscle_fatigue_score": 7.3,
    "fatigue_score": 7.3,
    "time_to_failure_min": 45.0,
    "legs_fail_min": 45.0,
    "model_used": "model_a_full",
    "nirs_active": true,
    "fallback": false
  },
  "model_b": {
    "metabolic_rate_watts": 287.6,
    "metabolic_w": 287.6,
    "o2_burn_rate_l_min": 0.87,
    "o2_burn_l_min": 0.87,
    "walk_back_limit_min": 84.5,
    "walk_back_min": 84.5,
    "walk_back_display": "84:30",
    "return_time_min": 20.9,
    "return_time_display": "20:51",
    "return_speed_kmh": 2.45,
    "o2_return_needed_l": 18.2,
    "distance_m": 850.0,
    "walk_back_level": "green",
    "walk_back_label": "Safe margin",
    "point_of_no_return_warning": false,
    "critical_turn_back_now": false
  },
  "model_c": {
    "primary_class": "Nominal",
    "confidence": 0.95,
    "ranked": [{"class": "Nominal", "probability": 0.95}],
    "tree_path": "ST 0.00 mV, BP 118, SpO2 98% → Nominal",
    "dont_give_nitro": false,
    "nitroglycerin_alert": null,
    "dont_give_list": [],
    "oxygen_surge": false,
    "flight_surgeons_alert": false,
    "protocol_steps": ["1. Vital signs within nominal envelope..."]
  },
  "mode3_readiness": {
    "subjective_score": 80.0,
    "objective_score": 97.5,
    "delta": -17.5,
    "masking_detected": false,
    "eva_clearance": "CLEARED"
  }
}
```

---

## 7. Интеграция с бэкендом и фронтендом

### На бэкенде (FastAPI):
Эндпоинт объявлен в [`app/api.py`](./app/api.py) и проксирует вызов в [`predict_all.py`](./predict_all.py):
```python
@router.post("/predict_all", tags=["ml"])
async def predict_all_endpoint(body: Dict[str, Any] | None = None) -> Dict[str, Any]:
    return run_predict_all(body or {})
```
* Эндпоинт доступен как `http://localhost:8000/predict_all`, так и `http://localhost:8000/api/predict_all`.

### На фронтенде (Next.js TypeScript):
Метод объявлен в [`frontend/lib/api/client.ts`](./frontend/lib/api/client.ts):
```typescript
import { aegisApi } from '@/lib/api/client';

const response = await aegisApi.predictAll({
  crew: 'A',
  distance_m: 1200,
  hr: 82,
  spo2: 97.5,
  speed: 2.4,
});

console.log(response.health_score);
console.log(response.model_b.return_time_min);
console.log(response.organ_scores_6);
```

---

## 8. Тестирование и воспроизведение

### Запуск полного набора юнит- и интеграционных тестов:
```bash
.venv\Scripts\python.exe -m pytest -v tests/
```
*Тестовый набор содержит **42 теста** (проверка Apollo, PhysioNet, LOLA, клинических правил и API).*

### Автономный запуск верификации `predict_all.py`:
```bash
.venv\Scripts\python.exe predict_all.py
```

### Переобучение моделей (при изменении датасетов):
```bash
.venv\Scripts\python.exe scripts/train_models.py
```
*Скрипт пересоберет таблицы признаков и переэкспортирует `.pkl` файлы в директорию `models/`.*

### Запуск всей системы (бэкенд + фронтенд):
```bash
start.bat
# Запустит FastAPI бэкенд на :8000 и Next.js консоль на :3000
```
