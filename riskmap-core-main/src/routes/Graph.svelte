<script>
    import { Chart } from 'chart.js/auto';
    import { onMount } from 'svelte';

    let canvas;
    let chart;

    onMount(() => {
        const ctx = canvas.getContext('2d');
        chart = new Chart(ctx, {
            type: 'line',
            options: {
                scales: {
                    y: {
                        beginAtZero: true,
                        min: -2,
                        ticks: {
                            callback: function (value, index, ticks) {
                                return `${value}℃`;
                            }
                        }
                    },
                    x: {
                        ticks: {
                            callback: function (value, index, ticks) {
                                return `${value}`;
                            }
                        }
                    }
                },
                aspectRatio: 1,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                }
            },
            data: {
                labels: [0],
                datasets: [
                    {
                        label: '온도저감효과',
                        data: [0],
                        borderWidth: 1,
                        backgroundColor: '#0BA5BEAA',
                        borderColor: '#00718FAA'
                    }
                ]
            }
        });
    });

    export function update(effects) {
        chart.data.labels = [...Array(effects.length + 1).keys()];
        chart.data.datasets[0].data = [0].concat(effects);
        chart.update();
    }
</script>

<div class="h-55">
    <canvas bind:this={canvas} id="myChart"></canvas>
</div>
