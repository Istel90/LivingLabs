<script>
    let { data = $bindable() } = $props();

    async function save() {
        const options = {
            suggestedName: 'Save',
            types: [
                {
                    description: 'JSON',
                    accept: {
                        'application/json': []
                    }
                }
            ],
            excludeAcceptAllOption: true
        };
        try {
            let handle = await window.showSaveFilePicker(options);
            let writable = await handle.createWritable();
            await writable.write(JSON.stringify(data, null, 2));
            await writable.close();
        } catch (e) {
            console.error(e);
        }
    }

    async function load() {
        const options = {
            types: [
                {
                    description: 'JSON',
                    accept: {
                        'application/json': []
                    }
                }
            ],
            excludeAcceptAllOption: true,
            multiple: false
        };
        let handle;
        try {
            [handle] = await window.showOpenFilePicker(options);
            let file = await handle.getFile();
            data = JSON.parse(await file.text());
        } catch (e) {
            console.error(e);
        }
    }
</script>

<div class="flex h-9 flex-row gap-1 rounded-md bg-white p-1 text-sm">
    <button
        class="w-16 rounded-md bg-white shadow-sm shadow-gray-500 transition duration-75 hover:bg-gray-200 active:translate-y-0.5"
        onclick={save}>저장</button
    >
    <button
        class="w-16 rounded-md bg-white shadow-sm shadow-gray-500 transition duration-75 hover:bg-gray-200 active:translate-y-0.5"
        onclick={load}>불러오기</button
    >
</div>
