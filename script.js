class SubtitleStitcher {
    // 在构造函数或 init 里添加 resultImage 拖拽到 workspace 的处理

    // 将结果图片以原始比例添加回工作区
    addResultImageToWorkspace(dataUrl) {
        const img = new window.Image();
        img.onload = () => {
            const imageObj = this.createImageObj(img, null);
            // 结果图使用全图裁剪（100%尺寸，从0开始）
            imageObj.crop.size = 100;
            imageObj.crop.position = 0;
            imageObj.crop.orientation = this.orientation;
            this.onImageAdded(imageObj);
        };
        img.src = dataUrl;
    }
    
    constructor() {
        // ---- 常量 ----
        this.DEFAULT_CROP_SIZE = 50;       // 默认裁剪百分比
        this.DEFAULT_CROP_POSITION = 25;   // 默认裁剪起始位置百分比
        this.DEFAULT_ORIENTATION = 'vertical';
        this.JPEG_QUALITY = 0.92;
        this.MIN_CROP_PX = 10;             // 最小裁剪像素

        // ---- 数据状态 ----
        this.images = [];
        this.selectedImageIndex = -1;
        this.orientation = this.DEFAULT_ORIENTATION;

        // ---- 拖拽状态 ----
        this.draggedElement = null;
        this.draggedIndex = null;
        this.draggedWasSelected = false;
        this.isDraggingFromOutside = false;

        // ---- 缩放状态 ----
        this.isResizing = false;

        this.init();
    }

    init() {
        // 获取DOM元素
        this.imageUpload = document.getElementById('imageUpload');
        this.processBtn = document.getElementById('processBtn');
        this.clearAllBtn = document.getElementById('clearAllBtn');
        this.workspace = document.getElementById('workspace');
        this.workspaceImages = document.getElementById('workspaceImages');
        this.resultCanvas = document.getElementById('resultCanvas');
        this.resultImage = document.getElementById('resultImage');
        this.resultContainer = document.getElementById('resultContainer');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.orientationToggle = document.getElementById('orientationToggle');

        // 初始化时隐藏结果图片和下载按钮
        this.resultImage.style.display = 'none';
        this.resultContainer.querySelector('.download-section').style.display = 'none';

        // 绑定事件
        this.imageUpload.addEventListener('change', (e) => this.handleImageUpload(e));
        this.processBtn.addEventListener('click', () => this.processImages());
        this.clearAllBtn.addEventListener('click', () => this.clearAllImages());
        this.downloadBtn.addEventListener('click', () => this.downloadResult());
        this.orientationToggle.addEventListener('mousedown', e => e.preventDefault()); // 防止双击高亮
        this.orientationToggle.addEventListener('click', () => this.toggleOrientation());

        // 初始化按钮文本
        this.updateOrientationToggleText();

        // 工作区拖拽上传支持
        this.workspace.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.workspace.classList.add('dragover');
            if (this.isDraggingFromOutside) {
                e.dataTransfer.dropEffect = 'copy';
            } else {
                e.dataTransfer.dropEffect = 'move';
            }
        });

        this.workspace.addEventListener('dragleave', (e) => {
            const rect = this.workspace.getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX >= rect.right || e.clientY < rect.top || e.clientY >= rect.bottom) {
                this.workspace.classList.remove('dragover');
            }
        });

        this.workspace.addEventListener('dragenter', (e) => {
            if (e.dataTransfer.types.includes('Files')) {
                this.isDraggingFromOutside = true;
            } else {
                this.isDraggingFromOutside = false;
            }
        });

        // 键盘粘贴支持
        this.workspace.addEventListener('paste', (e) => this.handlePaste(e));

        // 恢复结果图片拖回工作区支持
        this.resultImage.setAttribute('draggable', 'true');
        this.resultImage.ondragstart = (e) => {
            // 传递自定义类型，标记为 resultImage 拖拽
            e.dataTransfer.setData('application/x-stitch-result', this.resultImage.src);
            e.dataTransfer.effectAllowed = 'copy';
        };

        // 工作区支持接收 resultImage 拖拽
        this.workspace.addEventListener('drop', (e) => {
            e.preventDefault();
            this.workspace.classList.remove('dragover');
            // 优先处理 resultImage 拖拽
            if (e.dataTransfer.types.includes('application/x-stitch-result')) {
                const dataUrl = e.dataTransfer.getData('application/x-stitch-result');
                if (dataUrl) {
                    this.addResultImageToWorkspace(dataUrl);
                }
                return;
            }
            if (e.dataTransfer.files.length) {
                this.handleDroppedFiles(e.dataTransfer.files);
            }
            this.isDraggingFromOutside = false;
        });

        // 初始化时显示或隐藏工作区提示文本
        this.showWorkspaceHint();
    }

    // ========== 图片加载与对象创建 ==========

    // 创建标准的图片数据对象
    createImageObj(imgElement, file) {
        return {
            element: imgElement,
            file: file,
            crop: {
                size: this.DEFAULT_CROP_SIZE,
                position: this.DEFAULT_CROP_POSITION,
                orientation: this.DEFAULT_ORIENTATION
            }
        };
    }

    // 图片添加到工作区后的统一处理
    onImageAdded(imageObj) {
        this.images.push(imageObj);
        this.createWorkspacePreview(imageObj, this.images.length - 1);
        this.processBtn.disabled = false;
        this.clearAllBtn.disabled = false;
        this.selectImage(this.images.length - 1);
    }

    // 从 File 加载为 Image 元素
    loadImageFromFile(file, callback) {
        if (!file || !file.type.match('image.*')) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => callback(img);
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // ========== 键盘 & 粘贴处理 ==========

    // 处理粘贴事件
    handlePaste(e) {
        // 阻止默认粘贴行为
        e.preventDefault();
        
        // 检查剪贴板中是否有图片数据
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            // 检查是否为图片类型
            if (item.type.indexOf('image') !== -1) {
                const file = item.getAsFile();
                if (file) {
                    this.processPastedFile(file);
                }
            }
        }
    }

    // 处理粘贴的文件
    processPastedFile(file) {
        this.loadImageFromFile(file, (img) => {
            const imageObj = this.createImageObj(img, file);
            this.onImageAdded(imageObj);
        });
    }

    handleImageUpload(event) {
        const files = event.target.files;
        this.processFiles(files);
        this.imageUpload.value = '';
    }

    handleDroppedFiles(files) {
        if (this.isDraggingFromOutside) {
            this.processFiles(files);
        }
        this.isDraggingFromOutside = false;
    }

    processFiles(files) {
        if (files.length === 0) return;

        Array.from(files).forEach((file) => {
            this.loadImageFromFile(file, (img) => {
                const imageObj = this.createImageObj(img, file);
                this.onImageAdded(imageObj);
            });
        });
    }

    createWorkspacePreview(imageObj, index) {
        const container = document.createElement('div');
        container.className = 'workspace-image-container';
        container.dataset.index = index;

        // 索引显示
        const indexDisplay = document.createElement('div');
        indexDisplay.className = 'workspace-image-index';
        indexDisplay.textContent = index + 1;
        container.appendChild(indexDisplay);

        // 拖拽块
        const dragBlock = document.createElement('div');
        dragBlock.className = 'workspace-image-block';
        dragBlock.dataset.index = index;
        dragBlock.draggable = false;

        // 预览区
        const previewContainer = document.createElement('div');
        previewContainer.className = 'workspace-image';
        previewContainer.dataset.index = index;

        // 图片
        const img = imageObj.element.cloneNode();
        previewContainer.appendChild(img);

        // 删除按钮
        const deleteBtn = document.createElement('div');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteImage(parseInt(container.dataset.index));
        });

        dragBlock.appendChild(deleteBtn);
        dragBlock.appendChild(previewContainer);
        container.appendChild(dragBlock);
        this.workspaceImages.appendChild(container);

        // 隐藏工作区提示文本
        this.hideWorkspaceHint();

        // 拖拽排序相关事件
        dragBlock.addEventListener('mousedown', (e) => {
            if (!e.target.closest('.workspace-image')) {
                dragBlock.draggable = true;
            }
        });
        dragBlock.addEventListener('mouseup', () => {
            dragBlock.draggable = false;
        });
        dragBlock.addEventListener('dragstart', (e) => {
            this.draggedElement = container;
            this.draggedIndex = parseInt(container.dataset.index);
            this.draggedWasSelected = (this.selectedImageIndex === this.draggedIndex);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', this.draggedIndex);
            setTimeout(() => container.style.opacity = '0.5', 0);
        });
        dragBlock.addEventListener('dragend', (e) => {
            this.draggedElement.style.opacity = '1';
            this.draggedElement = null;
            this.isDraggingFromOutside = false;
            this.draggedIndex = null;
        });
        dragBlock.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!this.isDraggingFromOutside && this.draggedElement && this.draggedElement !== container) {
                container.style.backgroundColor = '#f0f8ff';
            }
        });
        
        dragBlock.addEventListener('dragleave', (e) => {
            container.style.backgroundColor = '';
        });
        
        dragBlock.addEventListener('drop', (e) => {
            e.preventDefault();
            container.style.backgroundColor = '';
            
            if (!this.isDraggingFromOutside && this.draggedElement && this.draggedIndex !== null) {
                const targetIndex = parseInt(container.dataset.index);
                if (this.draggedIndex !== targetIndex) {
                    // 交换图片数据
                    [this.images[this.draggedIndex], this.images[targetIndex]] = 
                    [this.images[targetIndex], this.images[this.draggedIndex]];
                    
                    // 重新渲染两个容器
                    this.refreshImageContainer(this.draggedIndex);
                    this.refreshImageContainer(targetIndex);
                    
                    // 更新选中状态
                    if (this.draggedWasSelected) {
                        this.selectImage(targetIndex);
                    } else if (this.selectedImageIndex === targetIndex) {
                        this.selectImage(this.draggedIndex);
                    }
                }
            }
        });

        dragBlock.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectImage(parseInt(container.dataset.index));
        });

        this.updateImageCropOverlay(previewContainer, imageObj);
    }

    // 隐藏工作区提示文本
    hideWorkspaceHint() {
        const hint = this.workspace.querySelector('.workspace-paste-hint');
        if (hint) {
            hint.style.display = 'none';
        }
    }

    // 显示工作区提示文本
    showWorkspaceHint() {
        const hint = this.workspace.querySelector('.workspace-paste-hint');
        if (hint && this.images.length === 0) {
            hint.style.display = 'block';
        }
    }

    // 刷新指定索引的容器内容
    refreshImageContainer(index) {
        const container = this.workspaceImages.children[index];
        if (!container) return;

        const imageObj = this.images[index];
        const previewContainer = container.querySelector('.workspace-image');
        const img = previewContainer.querySelector('img');

        // 更新索引（先更新，让 DOM 属性始终正确）
        container.dataset.index = index;
        container.querySelector('.workspace-image-block').dataset.index = index;
        previewContainer.dataset.index = index;

        // 更新序号显示
        const indexDisplay = container.querySelector('.workspace-image-index');
        indexDisplay.textContent = index + 1;

        // 更新图片源，等加载完成后再更新裁剪覆盖层（确保 offsetWidth/Height 正确）
        const updateOverlay = () => this.updateImageCropOverlay(previewContainer, imageObj);
        if (img.src !== imageObj.element.src) {
            img.src = imageObj.element.src;
            if (img.complete) {
                updateOverlay();
            } else {
                img.onload = updateOverlay;
            }
        } else {
            updateOverlay();
        }
    }

    selectImage(index) {
        if (index < 0 || index >= this.images.length) return;
        this.selectedImageIndex = index;

        document.querySelectorAll('.workspace-image-block').forEach((el) => {
            if (parseInt(el.dataset.index) === index) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });

        const imageObj = this.images[index];
        if (imageObj) {
            this.orientation = imageObj.crop.orientation;
            this.updateOrientationToggleText();
        }
    }

    updateImageCropOverlay(previewContainer, imageObj) {
        let overlay = previewContainer.querySelector('.crop-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'crop-overlay';
            previewContainer.appendChild(overlay);
        }
        
        // Clear previous handles
        overlay.innerHTML = '';
        overlay.className = 'crop-overlay'; // Reset classes

        const img = previewContainer.querySelector('img');
        const { size, position, orientation } = imageObj.crop;

        if (orientation === 'horizontal') {
            const width = (size / 100) * img.offsetWidth;
            const left = (position / 100) * img.offsetWidth;
            overlay.style.width = `${width}px`;
            overlay.style.height = `${img.offsetHeight}px`;
            overlay.style.left = `${left}px`;
            overlay.style.top = '0';

            ['left', 'right'].forEach(handleType => {
                const handle = document.createElement('div');
                handle.className = `resize-handle ${handleType}`;
                handle.addEventListener('mousedown', (e) => {
                    // 自动选中当前图片
                    const index = parseInt(previewContainer.dataset.index);
                    if (this.selectedImageIndex !== index) {
                        this.selectImage(index);
                    }
                    this.startResize(e, handleType);
                });
                overlay.appendChild(handle);
            });
        } else {
            overlay.classList.add('vertical');
            const height = (size / 100) * img.offsetHeight;
            const top = (position / 100) * img.offsetHeight;
            overlay.style.width = `${img.offsetWidth}px`;
            overlay.style.height = `${height}px`;
            overlay.style.left = '0';
            overlay.style.top = `${top}px`;

            ['top', 'bottom'].forEach(handleType => {
                const handle = document.createElement('div');
                handle.className = `resize-handle ${handleType}`;
                handle.addEventListener('mousedown', (e) => {
                    // 自动选中当前图片
                    const index = parseInt(previewContainer.dataset.index);
                    if (this.selectedImageIndex !== index) {
                        this.selectImage(index);
                    }
                    this.startResize(e, handleType);
                });
                overlay.appendChild(handle);
            });
        }
    }

    startResize(e, handleType) {
        e.preventDefault();
        e.stopPropagation();
        if (this.selectedImageIndex === -1) return;

        this.isResizing = true;
        const imageObj = this.images[this.selectedImageIndex];
        const previewContainer = document.querySelector(`.workspace-image[data-index="${this.selectedImageIndex}"]`);
        const img = previewContainer.querySelector('img');
        const overlay = previewContainer.querySelector('.crop-overlay');

        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = overlay.offsetWidth;
        const startHeight = overlay.offsetHeight;
        const startLeft = parseFloat(overlay.style.left) || 0;
        const startTop = parseFloat(overlay.style.top) || 0;
        const imgWidth = img.offsetWidth;
        const imgHeight = img.offsetHeight;

        // 最小裁剪尺寸（像素），防止裁剪框缩到看不见
        const MIN_CROP_PX = this.MIN_CROP_PX;

        const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

        const handleMouseMove = (moveEvent) => {
            if (!this.isResizing) return;
            moveEvent.preventDefault();

            if (imageObj.crop.orientation === 'horizontal') {
                const dx = moveEvent.clientX - startX;
                if (handleType === 'left') {
                    // 左边缘：允许范围 [0, 右边缘-MIN]，右边缘 = startLeft + startWidth
                    const rightEdge = startLeft + startWidth;
                    const maxLeft = rightEdge - MIN_CROP_PX;
                    const newLeft = clamp(startLeft + dx, 0, maxLeft);
                    const newWidth = rightEdge - newLeft;
                    imageObj.crop.position = (newLeft / imgWidth) * 100;
                    imageObj.crop.size = (newWidth / imgWidth) * 100;
                } else { // right
                    // 右边缘：允许范围 [左边缘+MIN, imgWidth]
                    const minWidth = MIN_CROP_PX;
                    const maxWidth = imgWidth - startLeft;
                    const newWidth = clamp(startWidth + dx, minWidth, maxWidth);
                    imageObj.crop.size = (newWidth / imgWidth) * 100;
                }
            } else { // vertical
                const dy = moveEvent.clientY - startY;
                if (handleType === 'top') {
                    // 上边缘：允许范围 [0, 下边缘-MIN]，下边缘 = startTop + startHeight
                    const bottomEdge = startTop + startHeight;
                    const maxTop = bottomEdge - MIN_CROP_PX;
                    const newTop = clamp(startTop + dy, 0, maxTop);
                    const newHeight = bottomEdge - newTop;
                    imageObj.crop.position = (newTop / imgHeight) * 100;
                    imageObj.crop.size = (newHeight / imgHeight) * 100;
                } else { // bottom
                    // 下边缘：允许范围 [上边缘+MIN, imgHeight]
                    const minHeight = MIN_CROP_PX;
                    const maxHeight = imgHeight - startTop;
                    const newHeight = clamp(startHeight + dy, minHeight, maxHeight);
                    imageObj.crop.size = (newHeight / imgHeight) * 100;
                }
            }
            this.updateImageCropOverlay(previewContainer, imageObj);
        };

        const handleMouseUp = () => {
            this.isResizing = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }

    refreshAllCropOverlays() {
        document.querySelectorAll('.workspace-image').forEach((container) => {
            const index = parseInt(container.dataset.index);
            if (this.images[index]) {
                this.updateImageCropOverlay(container, this.images[index]);
            }
        });
    }

    toggleOrientation() {
        if (this.selectedImageIndex === -1) return;
        
        const imageObj = this.images[this.selectedImageIndex];
        imageObj.crop.orientation = imageObj.crop.orientation === 'horizontal' ? 'vertical' : 'horizontal';
        this.orientation = imageObj.crop.orientation;
        
        this.refreshAllCropOverlays();
        this.updateOrientationToggleText();
    }

    updateOrientationToggleText() {
        if (!this.orientationToggle) return;
        
        let currentOrientation = this.DEFAULT_ORIENTATION;
        if (this.selectedImageIndex !== -1 && this.images[this.selectedImageIndex]) {
            currentOrientation = this.images[this.selectedImageIndex].crop.orientation;
        }

        // The button should show the action to be taken, so it displays the OPPOSITE
        if (currentOrientation === 'horizontal') {
            this.orientationToggle.textContent = '切换为横向';
        } else {
            this.orientationToggle.textContent = '切换为纵向';
        }
    }

    deleteImage(index) {
        this.images.splice(index, 1);
        this.workspaceImages.innerHTML = ''; // Easiest to just rebuild
        this.images.forEach((img, i) => this.createWorkspacePreview(img, i));

        if (this.images.length === 0) {
            this.selectedImageIndex = -1;
            this.processBtn.disabled = true;
            this.clearAllBtn.disabled = true;
            this.resultImage.style.display = 'none';
            this.resultContainer.querySelector('.download-section').style.display = 'none';
            // 保证无图片时结果区高度为默认
            this.resultContainer.style.minHeight = '500px';
            // 显示工作区提示文本
            this.showWorkspaceHint();
        } else {
            this.selectImage(Math.max(0, index - 1));
        }
        this.updateOrientationToggleText();
    }

    clearAllImages() {
        this.images = [];
        this.workspaceImages.innerHTML = '';
        this.selectedImageIndex = -1;
        this.processBtn.disabled = true;
        this.clearAllBtn.disabled = true;
        this.resultImage.style.display = 'none';
        this.resultContainer.querySelector('.download-section').style.display = 'none';
        // 保证无图片时结果区高度为默认
        this.resultContainer.style.minHeight = '500px';
        this.updateOrientationToggleText();
        // 显示工作区提示文本
        this.showWorkspaceHint();
    }

    processImages() {
        // 只处理工作区内所有图片，与选中图片无关
        if (!this.images || this.images.length === 0) return;
        // 有结果时移除最小高度
        this.resultContainer.style.minHeight = '';

        // 只用一个 <img id="resultImage">，每次都覆盖
        const canvas = this.resultCanvas;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 以第一张图片的 orientation 作为拼接方向
        const stitchDirection = this.images[0].crop.orientation;

        if (stitchDirection === 'horizontal') {
            let totalWidth = 0;
            let maxHeight = 0;
            const cropData = this.images.map(imageObj => {
                const img = imageObj.element;
                const width = (imageObj.crop.size / 100) * img.width;
                const x = (imageObj.crop.position / 100) * img.width;
                totalWidth += width;
                maxHeight = Math.max(maxHeight, img.height);
                return { img, sx: x, sy: 0, sWidth: width, sHeight: img.height, dWidth: width, dHeight: img.height };
            });

            canvas.width = totalWidth;
            canvas.height = maxHeight;

            let currentX = 0;
            cropData.forEach(data => {
                ctx.drawImage(data.img, data.sx, data.sy, data.sWidth, data.sHeight, currentX, 0, data.dWidth, data.dHeight);
                currentX += data.dWidth;
            });
        } else { // Vertical
            let totalHeight = 0;
            let maxWidth = 0;
            const cropData = this.images.map(imageObj => {
                const img = imageObj.element;
                const height = (imageObj.crop.size / 100) * img.height;
                const y = (imageObj.crop.position / 100) * img.height;
                totalHeight += height;
                maxWidth = Math.max(maxWidth, img.width);
                return { img, sx: 0, sy: y, sWidth: img.width, sHeight: height, dWidth: img.width, dHeight: height };
            });

            canvas.width = maxWidth;
            canvas.height = totalHeight;

            let currentY = 0;
            cropData.forEach(data => {
                ctx.drawImage(data.img, data.sx, data.sy, data.sWidth, data.sHeight, 0, currentY, data.dWidth, data.dHeight);
                currentY += data.dHeight;
            });
        }

        // 更新结果图片，只保留一张
        this.resultImage.src = canvas.toDataURL('image/jpeg', this.JPEG_QUALITY);
        this.resultImage.style.display = 'block';  // 改为block确保显示
        this.resultContainer.querySelector('.download-section').style.display = 'block';  // 改为block确保显示

        // 为结果图片添加拖拽支持
        this.resultImage.setAttribute('draggable', 'true');
        this.resultImage.ondragstart = (e) => {
            e.dataTransfer.setData('text/uri-list', this.resultImage.src);
            e.dataTransfer.setData('text/plain', this.resultImage.src);
        };
    }

    downloadResult() {
        const link = document.createElement('a');
        link.download = 'subtitle-stitch-result.png';
        link.href = this.resultImage.src;
        link.click();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SubtitleStitcher();
});
