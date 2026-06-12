<script>
    import { onMount } from 'svelte';
    import marker1_path from '$lib/img/marker1.png';
    import marker2_path from '$lib/img/marker2.png';

    const MARKER_SIZE = 20;

    let canvas;
    let ctx;
    let marker1;
    let marker2;
    let cur_item;

    onMount(() => {
        ctx = canvas.getContext('2d');

        marker1 = new Image();
        marker1.src = marker1_path;

        marker2 = new Image();
        marker2.src = marker2_path;
    });

    function selectItem(item) {
        cur_item = item;
    }

    function mark(event) {
        if (!ctx) {
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        if (cur_item === 'marker1') {
            ctx.drawImage(
                marker1,
                x - 0.5 * MARKER_SIZE,
                y - 0.5 * MARKER_SIZE,
                MARKER_SIZE,
                MARKER_SIZE
            );
        } else if (cur_item === 'marker2') {
            ctx.drawImage(
                marker2,
                x - 0.5 * MARKER_SIZE,
                y - 0.5 * MARKER_SIZE,
                MARKER_SIZE,
                MARKER_SIZE
            );
        }
    }

    function clearCanvas() {
        if (ctx != null) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
</script>

<div class="tools">
    <button onclick={() => selectItem('marker1')}>Marker 1</button>
    <button onclick={() => selectItem('marker2')}>Marker 2</button>
    <button onclick={clearCanvas}>Clear</button>
</div>
<canvas bind:this={canvas} width="800" height="800" onmousedown={mark}></canvas>

<style>
    canvas {
        border: 1px solid black;
        cursor: crosshair;
    }
    .tools {
        display: flex;
        gap: 10px;
        margin-bottom: 10px;
    }
</style>
