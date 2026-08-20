const search = document.querySelector<HTMLInputElement>('#help-search');
const count = document.querySelector<HTMLElement>('#help-search-count');
const sections = Array.from(
  document.querySelectorAll<HTMLElement>('[data-help-section]'),
);

search?.addEventListener('input', () => {
  const query = normalize(search.value);
  let visibleCount = 0;
  for (const section of sections) {
    const visible = query.length === 0 || normalize(section.textContent ?? '').includes(query);
    section.hidden = !visible;
    if (visible) visibleCount += 1;
  }
  if (count !== null) {
    count.textContent = query.length === 0
      ? `${sections.length} 个主题`
      : `${visibleCount} 个匹配主题`;
  }
});

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN');
}
