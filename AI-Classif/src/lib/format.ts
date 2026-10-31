export const regimeShort = (regime: string) => ({
  prohibition: 'Запрет', restriction: 'Ограничение', quota: 'Квота 223-ФЗ',
}[regime] || regime)
