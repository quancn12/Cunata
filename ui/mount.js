/// <reference lib="dom" />
import { renderBlocks, renderText } from './blocks.js';
import { ensureScopedStyles } from './styles.js';
import { createCompositionGuard } from './composition.js';
import { openModal } from './modal.js';
import { createStatusAnnouncer } from './status.js';
/**
 * Canonical UI mount convention implementation for Cunata web components.
 * Conforms to WEB-contract.md §5:
 * export function mount(root: HTMLElement, model: unknown, actions: Readonly<Record<string,(value:unknown)=>void>>): () => void;
 */
export function mount(root, model, actions) {
    if (!root) {
        throw new Error('Root HTMLElement must be provided to mount()');
    }
    const doc = root.ownerDocument || document;
    // 1. Ensure scoped CSS exists without modifying root stylesheet
    ensureScopedStyles(doc);
    // 2. Mark root container with scoped class
    if (!root.classList.contains('cunata-ui')) {
        root.classList.add('cunata-ui');
    }
    // 3. Clean any existing children in root
    root.textContent = '';
    const cleanupTasks = [];
    // 4. Mount model content
    if (model === null || model === undefined) {
        return () => {
            root.textContent = '';
        };
    }
    // Case A: Model is a list of Blocks directly
    if (Array.isArray(model)) {
        const blocksEl = renderBlocks(model, { document: doc });
        root.appendChild(blocksEl);
    }
    // Case B: Model is a string or primitive
    else if (typeof model === 'string' || typeof model === 'number' || typeof model === 'boolean') {
        root.appendChild(renderText(String(model), { document: doc }));
    }
    // Case C: Model is a structured UI View Model
    else if (typeof model === 'object') {
        const vm = model;
        const container = doc.createElement('div');
        container.className = 'cunata-view-container';
        // Title
        if (vm.title) {
            const heading = doc.createElement('h2');
            heading.className = 'cunata-heading';
            heading.textContent = vm.title;
            container.appendChild(heading);
        }
        // Description
        if (vm.description) {
            container.appendChild(renderText(vm.description, { document: doc }));
        }
        // Blocks
        if (vm.blocks && vm.blocks.length > 0) {
            container.appendChild(renderBlocks(vm.blocks, { document: doc }));
        }
        // Status announcer
        if (vm.status) {
            const announcer = createStatusAnnouncer({ container: doc.createElement('div'), document: doc });
            container.appendChild(announcer.getElement());
            announcer.announce(vm.status);
            cleanupTasks.push(() => announcer.dispose());
        }
        // Form fields (with composition guard for native IME preservation)
        if (vm.fields && vm.fields.length > 0) {
            const form = doc.createElement('form');
            form.onsubmit = (e) => e.preventDefault();
            const fieldset = doc.createElement('fieldset');
            const legend = doc.createElement('legend');
            legend.textContent = 'Thông tin nhập liệu';
            fieldset.appendChild(legend);
            for (const field of vm.fields) {
                const fieldWrapper = doc.createElement('div');
                fieldWrapper.style.margin = '12px 0';
                const label = doc.createElement('label');
                label.textContent = field.label;
                label.style.display = 'block';
                label.style.marginBottom = '4px';
                label.style.fontWeight = '500';
                const input = doc.createElement('input');
                input.type = field.type || 'text';
                input.name = field.name;
                input.value = field.value || '';
                if (field.placeholder)
                    input.placeholder = field.placeholder;
                if (field.maxLength)
                    input.maxLength = field.maxLength;
                // Apply composition guard to preserve Vietnamese IME typing
                const guard = createCompositionGuard({
                    element: input,
                    onCommit: (val) => {
                        const actionFn = actions[field.name];
                        if (typeof actionFn === 'function') {
                            actionFn(val);
                        }
                    },
                });
                cleanupTasks.push(() => guard.dispose());
                label.appendChild(input);
                fieldWrapper.appendChild(label);
                fieldset.appendChild(fieldWrapper);
            }
            form.appendChild(fieldset);
            container.appendChild(form);
        }
        // Action buttons
        if (vm.actions && vm.actions.length > 0) {
            const btnBar = doc.createElement('div');
            btnBar.className = 'cunata-actions-bar';
            btnBar.style.display = 'flex';
            btnBar.style.gap = '8px';
            btnBar.style.margin = '16px 0';
            for (const act of vm.actions) {
                const btn = doc.createElement('button');
                btn.type = 'button';
                btn.className = act.primary ? 'cunata-btn cunata-btn-primary' : 'cunata-btn';
                btn.textContent = act.label;
                if (act.disabled)
                    btn.disabled = true;
                const handleClick = () => {
                    const fn = actions[act.name];
                    if (typeof fn === 'function') {
                        fn(act.name);
                    }
                };
                btn.addEventListener('click', handleClick);
                cleanupTasks.push(() => btn.removeEventListener('click', handleClick));
                btnBar.appendChild(btn);
            }
            container.appendChild(btnBar);
        }
        // Optional modal dialog
        if (vm.modal) {
            const modalBackdrop = doc.createElement('div');
            modalBackdrop.className = 'cunata-modal-backdrop';
            const dialogEl = doc.createElement('div');
            dialogEl.className = 'cunata-modal-dialog';
            const modalHeading = doc.createElement('h3');
            modalHeading.textContent = vm.modal.title;
            dialogEl.appendChild(modalHeading);
            if (vm.modal.content) {
                dialogEl.appendChild(renderText(vm.modal.content, { document: doc }));
            }
            if (vm.modal.blocks) {
                dialogEl.appendChild(renderBlocks(vm.modal.blocks, { document: doc }));
            }
            const closeBtn = doc.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'cunata-btn';
            closeBtn.textContent = 'Đóng';
            dialogEl.appendChild(closeBtn);
            modalBackdrop.appendChild(dialogEl);
            container.appendChild(modalBackdrop);
            const modalInst = openModal(dialogEl, {
                document: doc,
                onClose: () => {
                    if (vm.modal?.onCloseAction) {
                        const closeFn = actions[vm.modal.onCloseAction];
                        if (typeof closeFn === 'function') {
                            closeFn(null);
                        }
                    }
                    if (modalBackdrop.parentNode) {
                        modalBackdrop.parentNode.removeChild(modalBackdrop);
                    }
                },
            });
            closeBtn.addEventListener('click', () => modalInst.close());
            cleanupTasks.push(() => {
                if (modalInst.isOpened()) {
                    modalInst.close();
                }
            });
        }
        root.appendChild(container);
    }
    // 5. Return unmount cleanup function
    return () => {
        for (const task of cleanupTasks) {
            try {
                task();
            }
            catch {
                // ignore errors during unmount cleanup
            }
        }
        root.textContent = '';
    };
}
