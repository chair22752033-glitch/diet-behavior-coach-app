/*
 * Phase 6 TASK 1.114｜Health Insight UI/UX Implementation
 * Foundation
 * - Input Page（Input Experience）
 *
 * 責任：組裝規格Expected UI Areas第2節Input Experience要求的
 * "友善問題卡片"畫面結構——延續TASK1.107第2節已定義的四大類
 * 輸入資料（User Profile Data/Health Goal Data/Daily Behavior
 * Data/Measurement Data），這裡示範性地組裝Required
 * Fields（age/gender/height/weight）跟Health Goal
 * Selection兩組問題卡片，用卡片式選擇/引導式輸入取代傳統長
 * 表單（延續規格Design direction"Avoid traditional forms.
 * Prefer: cards, selections, guided interaction"）。
 *
 * 這個檔案**只負責排版**，不做任何輸入驗證（驗證留給既有
 * Product Entry/Contract/Adapter/Health Insight
 * Feature，延續TASK1.112/1.113已確認的既有驗證責任分工），也
 * 不知道使用者填寫完成後資料會怎麼被組裝成`rawInput`（那是
 * 規劃中的Product Feature層職責）。
 */
import { getDesignSystemCSS } from '../design_system/design_tokens.js';
import { createChoiceQuestionCard, createInputQuestionCard } from '../components/question_card.js';

/**
 * User Profile Data必要欄位（延續TASK1.107第2節A Required
 * Fields：age/gender/height/weight）對應的問題卡片設定。
 */
const REQUIRED_PROFILE_QUESTIONS = [
  { fieldKey: 'age', question: '你今年幾歲呢？', inputType: 'number', unit: '歲', placeholder: '例如 28' },
  { fieldKey: 'height', question: '你的身高大概是？', inputType: 'number', unit: 'cm', placeholder: '例如 165' },
  { fieldKey: 'weight', question: '你目前的體重大概是？', inputType: 'number', unit: 'kg', placeholder: '例如 60' },
];

const GENDER_QUESTION = {
  fieldKey: 'gender',
  question: '想先確認一下你的性別',
  options: [
    { value: 'female', label: '女性' },
    { value: 'male', label: '男性' },
    { value: 'other', label: '其他 / 不想說' },
  ],
};

/**
 * Health Goal Data（延續TASK1.107第2節B）對應的問題卡片設定。
 */
const HEALTH_GOAL_QUESTION = {
  fieldKey: 'healthGoal',
  question: '這陣子你比較想達成什麼呢？',
  options: [
    { value: 'weight_loss', label: '想瘦一點' },
    { value: 'weight_maintenance', label: '維持現在的狀態' },
    { value: 'muscle_gain', label: '想變得更結實' },
    { value: 'healthy_lifestyle', label: '單純想過得健康一點' },
  ],
};

/**
 * 組裝完整的Input Experience畫面結構——第一次評估情境（延續
 * TASK1.113第2節A First Health
 * Assessment）需要的Required Fields跟Health Goal Selection。
 *
 * @returns {string}
 */
export function renderHealthInsightInputExperience() {
  const profileCards = REQUIRED_PROFILE_QUESTIONS.map((q) => createInputQuestionCard(q)).join('\n');
  const genderCard = createChoiceQuestionCard(GENDER_QUESTION);
  const healthGoalCard = createChoiceQuestionCard(HEALTH_GOAL_QUESTION);

  return [
    `<style>${getDesignSystemCSS()}</style>`,
    '<section class="hi-input-experience" data-hi-page="input">',
    '  <div class="hi-input-section hi-input-profile">',
    genderCard,
    profileCards,
    '  </div>',
    '  <div class="hi-input-section hi-input-goal">',
    healthGoalCard,
    '  </div>',
    '</section>',
  ].join('\n');
}
