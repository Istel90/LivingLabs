<script>
    import dot from '$lib/img/dot.png';
    import line from '$lib/img/line.png';
    import polygon from '$lib/img/polygon.png';

    const items = new Map([
        ['dot', dot],
        ['line', line],
        ['polygon', polygon]
    ]);

    let activeItem = 'none';

    function toggle(item) {
        activeItem = activeItem === item ? 'none' : item;
    }
</script>

<div class="flex">
    <div class="flex w-20 flex-col space-y-2 rounded-2xl bg-gray-100 p-2 shadow-lg">
        {#each items.entries() as [item, path]}
            <button
                onclick={() => toggle(item)}
                class={`rounded-xl px-2 py-2 text-left transition-colors duration-100 ${
                    activeItem === item
                        ? 'bg-blue-500 hover:bg-blue-700'
                        : 'bg-white hover:bg-gray-200'
                }`}
            >
                <img src={path} alt={item} />
            </button>
        {/each}
    </div>
    Hello
</div>
