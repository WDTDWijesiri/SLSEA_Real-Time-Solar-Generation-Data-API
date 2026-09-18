export function scopeClause(auth, params, aliases = { province: 'p', district: 'd' }) {
  if (auth.role === 'province') {
    params.push(auth.provinceId);
    return `${aliases.province}.id = ?`;
  }
  if (auth.role === 'district') {
    params.push(auth.districtId);
    return `${aliases.district}.id = ?`;
  }
  return 'TRUE';
}
