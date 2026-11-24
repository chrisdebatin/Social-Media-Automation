/** Secret key in the employee submission link (/einreichen?k=…). Without SUBMIT_KEY the link is disabled. */
export const submitKey = () => process.env.SUBMIT_KEY?.trim() || '';
export const submitEnabled = () => submitKey().length >= 12;

export function checkSubmitKey(given: string | null | undefined): boolean {
  const key = submitKey();
  if (!submitEnabled() || !given) return false;
  let diff = given.length ^ key.length;
  for (let i = 0; i < Math.max(given.length, key.length); i++) diff |= (given.charCodeAt(i) || 0) ^ (key.charCodeAt(i) || 0);
  return diff === 0;
}
