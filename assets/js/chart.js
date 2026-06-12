// ── Chart init — data injected via data-* attributes ─────────

(function () {
  const chartEl  = document.getElementById('clickChart');
  const deviceEl = document.getElementById('deviceChart');

  if (chartEl) {
    const labels = JSON.parse(chartEl.dataset.labels);
    const values = JSON.parse(chartEl.dataset.values);
    new Chart(chartEl, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: '#e8ff0033',
          borderColor: '#e8ff00',
          borderWidth: 1,
          borderRadius: 3,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: '#1a1a1a' }, ticks: { color: '#666', font: { size: 10 }, maxTicksLimit: 10 } },
          y: { grid: { color: '#1a1a1a' }, ticks: { color: '#666', font: { size: 10 }, stepSize: 1 }, beginAtZero: true }
        }
      }
    });
  }

  if (deviceEl) {
    const labels = JSON.parse(deviceEl.dataset.labels);
    const values = JSON.parse(deviceEl.dataset.values);
    const colors = JSON.parse(deviceEl.dataset.colors);
    if (values.length > 0) {
      new Chart(deviceEl, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: { legend: { display: false } },
          cutout: '65%'
        }
      });
    }
  }
})();
