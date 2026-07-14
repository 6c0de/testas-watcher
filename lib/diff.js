function transitionsToOpen(previous, current) {
  const opened = [];
  for (const [school, status] of Object.entries(current)) {
    const wasOpen = previous[school] === 'open';
    if (status === 'open' && !wasOpen) opened.push(school);
  }
  return opened;
}

module.exports = { transitionsToOpen };
