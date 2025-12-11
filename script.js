class SubtitleStitcher {
    // 在构造函数或 init 里添加 resultImage 拖拽到 workspace 的处理

    // 新增方法：将结果图片以原始比例添加回工作区
    addResultImageToWorkspace(dataUrl) {
        const img = new window.Image();
        img.onload = () => {
            // 伪造一个 File 对象用于一致性（来源为 result）
            const file = { name: 'result.jpg', type: 'image/jpeg', fromResult: true };
            const imageObj = {
                element: img,
                file: file,
                crop: {
                    size: 100,
                    position: 0,
                    orientation: this.orientation // 保持当前方向
                }
            };
            this.images.push(imageObj);
            this.createWorkspacePreview(imageObj, this.images.length - 1);
            this.processBtn.disabled = false;
            this.clearAllBtn.disabled = false;
            this.selectImage(this.images.length - 1);
        };
        img.src = dataUrl;
    }
    
    constructor() {
        this.images = [];
        this.selectedImageIndex = -1;
        this.cropSize = 50; // 百分比
        this.cropPosition = 25; // 百分比
        this.orientation = 'vertical'; // 全局方向，主要用于拼接
        this.draggedElement = null;
        this.draggedIndex = null;
        this.isResizing = false;
        this.resizeHandle = null;
        this.isDraggingFromOutside = false; // 标记是否从外部拖拽
        this.dragOverElement = null;
        this.dragOverTimeout = null;
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

        this.workspace.addEventListener('drop', (e) => {
            e.preventDefault();
            this.workspace.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                this.handleDroppedFiles(e.dataTransfer.files);
            }
            this.isDraggingFromOutside = false;
        });

        this.workspace.addEventListener('dragenter', (e) => {
            if (e.dataTransfer.types.includes('Files')) {
                this.isDraggingFromOutside = true;
            } else {
                this.isDraggingFromOutside = false;
            }
        });

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
            if (!file.type.match('image.*')) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const imageObj = {
                        element: img,
                        file: file,
                        crop: {
                            size: 50,
                            position: 25,
                            orientation: 'vertical' // 新图片默认使用纵向裁剪
                        }
                    };

                    this.images.push(imageObj);
                    this.createWorkspacePreview(imageObj, this.images.length - 1);
                    this.processBtn.disabled = false;
                    this.clearAllBtn.disabled = false;
                    this.selectImage(this.images.length - 1);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
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
        img.style.maxWidth = '350px';
        img.style.maxHeight = '350px';
        img.style.minWidth = '263px';
        img.style.minHeight = '263px';
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

    // 刷新指定索引的容器内容
    refreshImageContainer(index) {
        const container = this.workspaceImages.children[index];
        if (!container) return;
        
        const imageObj = this.images[index];
        const previewContainer = container.querySelector('.workspace-image');
        const img = previewContainer.querySelector('img');
        
        // 更新图片源
        img.src = imageObj.element.src;
        
        // 更新索引
        container.dataset.index = index;
        container.querySelector('.workspace-image-block').dataset.index = index;
        previewContainer.dataset.index = index;
        
        // 更新序号显示
        const indexDisplay = container.querySelector('.workspace-image-index');
        indexDisplay.textContent = index + 1;
        
        // 更新裁剪覆盖层
        this.updateImageCropOverlay(previewContainer, imageObj);
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

        const handleMouseMove = (moveEvent) => {
            if (!this.isResizing) return;
            moveEvent.preventDefault();

            if (imageObj.crop.orientation === 'horizontal') {
                const dx = moveEvent.clientX - startX;
                if (handleType === 'left') {
                    const newLeft = Math.max(0, startLeft + dx);
                    const newWidth = startWidth - (newLeft - startLeft);
                    if (newLeft + newWidth > imgWidth) return;
                    imageObj.crop.position = (newLeft / imgWidth) * 100;
                    imageObj.crop.size = (newWidth / imgWidth) * 100;
                } else { // right
                    const newWidth = Math.min(imgWidth - startLeft, startWidth + dx);
                    if (newWidth < 0) return;
                    imageObj.crop.size = (newWidth / imgWidth) * 100;
                }
            } else { // vertical
                const dy = moveEvent.clientY - startY;
                if (handleType === 'top') {
                    const newTop = Math.max(0, startTop + dy);
                    const newHeight = startHeight - (newTop - startTop);
                    if (newTop + newHeight > imgHeight) return;
                    imageObj.crop.position = (newTop / imgHeight) * 100;
                    imageObj.crop.size = (newHeight / imgHeight) * 100;
                } else { // bottom
                    const newHeight = Math.min(imgHeight - startTop, startHeight + dy);
                    if (newHeight < 0) return;
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
        
        let currentOrientation = 'vertical'; // Default if no image is selected
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
        this.resultImage.src = canvas.toDataURL('image/jpeg', 0.92);
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
