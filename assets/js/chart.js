(function init() {
  if (typeof Chart === 'undefined') {
    setTimeout(init, 50);
    return;
  }

  function decode(b64) {
    try {
      return JSON.parse(decodeURIComponent(escape(atob(b64))));
    } catch (e) {
      return [];
    }
  }

  const chartEl  = document.getElementById('clickChart');
  const deviceEl = document.getElementById('deviceChart');

  if (chartEl && chartEl.dataset.labels) {
    const labels = decode(chartEl.dataset.labels);
    const values = decode(chartEl.dataset.values);
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
          x: {
            grid: { color: '#1a1a1a' },
            ticks: { color: '#666', font: { size: 10 }, maxTicksLimit: 10 }
          },
          y: {
            grid: { color: '#1a1a1a' },
            ticks: { color: '#666', font: { size: 10 }, stepSize: 1 },
            beginAtZero: true
          }
        }
      }
    });
  }

  if (deviceEl && deviceEl.dataset.labels) {
    const labels = decode(deviceEl.dataset.labels);
    const values = decode(deviceEl.dataset.values);
    const colors = decode(deviceEl.dataset.colors);
    if (values.length > 0) {
      new Chart(deviceEl, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          cutout: '65%'
        }
      });
    }
  }
})();
