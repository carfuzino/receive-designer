// Receipt Designer Application
class ReceiptDesigner {
  constructor() {
    this.currentTemplate = null;
    this.selectedElement = null;
    this.zoomLevel = 100;
    this.history = [];
    this.historyIndex = -1;
    this.isWYSIWYGMode = false;
    this.inlineToolbar = null;
    this.debounceTimer = null;
    this.companySaveTimer = null;

    this.initializeApp();
    this.bindEvents();
    this.setupTemplates();
    this.initializeDefaultMode();

    // Add security protections
    this.addCSPProtection();
    this.validateReceiptData();
  }

  initializeApp() {
    // Initialize DOM elements
    this.receiptPage = document.getElementById('receiptPage');
    this.formatToolbar = document.getElementById('formatToolbar');
    this.logoModal = document.getElementById('logoModal');

    // Setup default receipt data with localStorage support
    this.receiptData = {
      company: this.loadCompanyData() || {
        name: 'บริษัท ตัวอย่าง จำกัด',
        address: '123 ถนนสุขุมวิท แขวงคลองตัน เขตวัฒนา กรุงเทพฯ 10110',
        phone: '02-123-4567',
        email: 'info@company.com',
        taxId: '0123456789012'
      },
      customer: {
        name: 'คุณลูกค้า ตัวอย่าง',
        address: '456 ถนนรัชดา เขตห้วยขวาง กรุงเทพฯ 10310',
        phone: '08-1234-5678'
      },
      receipt: {
        number: 'R2024001',
        date: new Date().toLocaleDateString('th-TH'),
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('th-TH')
      },
      items: [
        {description: 'สินค้า/บริการ 1', quantity: 2, price: 500, total: 1000},
        {description: 'สินค้า/บริการ 2', quantity: 1, price: 750, total: 750},
        {description: 'สินค้า/บริการ 3', quantity: 3, price: 300, total: 900}
      ],
      totals: {
        subtotal: 2650,
        vat: 185.5,
        total: 2835.5
      }
    };
  }

  bindEvents() {
    // Template selection
    document.querySelectorAll('.template-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const template = e.currentTarget.dataset.template;
        this.selectTemplate(template);
      });
    });

    // Toolbar buttons
    document.getElementById('newReceipt').addEventListener('click', () => this.newReceipt());
    document.getElementById('printReceipt').addEventListener('click', () => this.printReceipt());
    document.getElementById('exportPdf').addEventListener('click', () => this.exportToPDF());

    // Company data buttons
    document.getElementById('resetCompanyData').addEventListener('click', () => this.resetCompanyData());

    document.getElementById('undo').addEventListener('click', () => this.undo());
    document.getElementById('redo').addEventListener('click', () => this.redo());
    document.getElementById('zoomIn').addEventListener('click', () => this.zoomIn());
    document.getElementById('zoomOut').addEventListener('click', () => this.zoomOut());

    // Mode buttons
    document.getElementById('editMode').addEventListener('click', () => this.enableWYSIWYGMode());
    document.getElementById('previewMode').addEventListener('click', () => this.disableWYSIWYGMode());

    // Format toolbar events
    this.bindFormatToolbarEvents();

    // Text selection for WYSIWYG
    document.addEventListener('mouseup', () => this.handleTextSelection());
    document.addEventListener('keyup', () => this.handleTextSelection());

    // Tool buttons
    document.getElementById('addLogo').addEventListener('click', () => this.showLogoModal());
    document.getElementById('addField').addEventListener('click', () => this.addField());

    // Color and font changes
    document.getElementById('primaryColor').addEventListener('change', (e) => {
      this.updatePrimaryColor(e.target.value);
    });

    document.getElementById('secondaryColor').addEventListener('change', (e) => {
      this.updateSecondaryColor(e.target.value);
    });

    document.getElementById('fontFamily').addEventListener('change', (e) => {
      this.updateFontFamily(e.target.value);
    });

    // VAT Rate change
    document.getElementById('vatRate').addEventListener('change', () => {
      this.calculateTotals();
      this.updateVatLabel();
    });

    // Modal events
    document.querySelector('.modal-close').addEventListener('click', () => this.hideModal());
    document.getElementById('logoUpload').addEventListener('click', () => {
      document.getElementById('logoInput').click();
    });

    document.getElementById('logoInput').addEventListener('change', (e) => {
      this.handleLogoUpload(e);
    });

    // Drag and drop for logo
    const logoUpload = document.getElementById('logoUpload');
    logoUpload.addEventListener('dragover', (e) => {
      e.preventDefault();
      logoUpload.style.backgroundColor = '#f0f8ff';
    });

    logoUpload.addEventListener('dragleave', () => {
      logoUpload.style.backgroundColor = '';
    });

    logoUpload.addEventListener('drop', (e) => {
      e.preventDefault();
      logoUpload.style.backgroundColor = '';
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.processLogoFile(files[0]);
      }
    });

    // Click outside to deselect
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.editable') &&
        !e.target.closest('.format-toolbar')) {
        this.deselectElement();
        this.hideInlineToolbar();
      }
    });
  }

  // WYSIWYG Mode Functions
  enableWYSIWYGMode() {
    this.isWYSIWYGMode = true;
    document.body.classList.add('wysiwyg-mode');

    // Update mode buttons
    document.getElementById('editMode').classList.add('active');
    document.getElementById('previewMode').classList.remove('active');

    // Don't show format toolbar immediately - it will appear on text selection
    // this.formatToolbar.style.display = 'block';

    // Make all editable elements content editable
    this.makeElementsContentEditable(true);

    // Show edit mode indicator
    this.showEditModeIndicator();
  }

  disableWYSIWYGMode() {
    this.isWYSIWYGMode = false;
    document.body.classList.remove('wysiwyg-mode');

    // Update mode buttons
    document.getElementById('editMode').classList.remove('active');
    document.getElementById('previewMode').classList.add('active');

    // Hide format toolbar
    this.formatToolbar.style.display = 'none';

    // Disable content editing
    this.makeElementsContentEditable(false);

    // Hide indicator
    this.hideEditModeIndicator();
  }

  makeElementsContentEditable(enable) {
    const editableElements = this.receiptPage.querySelectorAll('.editable');
    editableElements.forEach(element => {
      // ไม่ให้แก้ไขช่องยอดรวม ภาษี และรวมทั้งสิ้น
      const isCalculatedField = element.classList.contains('item-total') ||
        element.closest('.total-box') ||
        element.closest('.total-section') ||
        element.closest('[class*="total"]');

      if (enable && !isCalculatedField) {
        element.setAttribute('contenteditable', 'true');
        element.addEventListener('input', this.handleContentEdit.bind(this));
        element.addEventListener('focus', this.handleElementFocus.bind(this));
        element.addEventListener('blur', this.handleElementBlur.bind(this));
      } else {
        element.removeAttribute('contenteditable');
        element.removeEventListener('input', this.handleContentEdit.bind(this));
        element.removeEventListener('focus', this.handleElementFocus.bind(this));
        element.removeEventListener('blur', this.handleElementBlur.bind(this));
      }
    });
  }

  handleContentEdit(e) {
    const element = e.target;

    // Sync content with receiptData
    this.syncElementToReceiptData(element);

    // ตรวจสอบว่าเป็นการแก้ไขข้อมูลในตารางสินค้าหรือไม่
    if (element.classList.contains('item-quantity') ||
      element.classList.contains('item-price') ||
      element.closest('.items-table')) {
      // คำนวณยอดรวมใหม่หลังจากการแก้ไข
      setTimeout(() => this.calculateTotals(), 300);
    }

    // Debounced save
    this.debouncedSave();
  }

  handleElementFocus(e) {
    this.selectedElement = e.target;
    e.target.classList.add('selected');
  }

  handleElementBlur(e) {
    e.target.classList.remove('selected');
    this.debouncedSave();
  }

  handleTextSelection() {
    if (!this.isWYSIWYGMode) return;

    const selection = window.getSelection();
    if (selection.rangeCount > 0 && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const selectedElement = range.commonAncestorContainer.nodeType === Node.TEXT_NODE ?
        range.commonAncestorContainer.parentElement : range.commonAncestorContainer;

      if (selectedElement.closest('.editable')) {
        this.showInlineToolbar(range);
        this.updateToolbarState();
      }
    } else {
      this.hideInlineToolbar();
    }
  }

  showInlineToolbar(range) {
    const rect = range.getBoundingClientRect();
    const toolbar = this.formatToolbar;

    // Show the toolbar
    toolbar.style.display = 'block';

    // Position it above the selection
    const toolbarRect = toolbar.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - toolbarRect.width / 2;
    let top = rect.top - toolbarRect.height - 10;

    // Keep toolbar within viewport
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };

    if (left < 10) left = 10;
    if (left + toolbarRect.width > viewport.width - 10) {
      left = viewport.width - toolbarRect.width - 10;
    }

    if (top < 10) {
      // Show below selection if no room above
      top = rect.bottom + 10;
    }

    toolbar.style.left = left + 'px';
    toolbar.style.top = top + 'px';
  }

  hideInlineToolbar() {
    if (this.formatToolbar) {
      this.formatToolbar.style.display = 'none';
    }
  }

  updateToolbarState() {
    // Update toolbar button states based on current selection
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;

    // Check if formatting is applied
    const isBold = document.queryCommandState('bold');
    const isItalic = document.queryCommandState('italic');
    const isUnderline = document.queryCommandState('underline');

    // Update button states
    this.toggleToolbarButton('bold', isBold);
    this.toggleToolbarButton('italic', isItalic);
    this.toggleToolbarButton('underline', isUnderline);
  }

  toggleToolbarButton(command, isActive) {
    const button = document.querySelector(`[data-command="${command}"]`);
    if (button) {
      if (isActive) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    }
  }

  bindFormatToolbarEvents() {
    // Format buttons
    const toolbarButtons = document.querySelectorAll('.format-toolbar .toolbar-btn[data-command]');
    toolbarButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const command = button.dataset.command;
        this.executeFormatCommand(command);
      });
    });

    // Font size select
    const fontSizeSelect = document.getElementById('fontSizeSelect');
    if (fontSizeSelect) {
      fontSizeSelect.addEventListener('change', (e) => {
        this.applyFontSize(e.target.value);
      });
    }

    // Text color
    const textColor = document.getElementById('textColor');
    if (textColor) {
      textColor.addEventListener('change', (e) => {
        this.applyTextColor(e.target.value);
      });
    }

    // Add item button
    const addItemBtn = document.getElementById('addItemBtn');
    if (addItemBtn) {
      addItemBtn.addEventListener('click', () => {
        this.addNewItem();
      });
    }
  }

  executeFormatCommand(command = '') {
    document.execCommand(command, false, null);
    this.updateToolbarState();
    this.debouncedSave();
  }

  applyFontSize(size) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (!range.collapsed) {
        document.execCommand('fontSize', false, '7');
        const selectedElement = range.commonAncestorContainer.parentElement;
        const fontElements = selectedElement.querySelectorAll('font[size="7"]');
        fontElements.forEach(el => {
          el.style.fontSize = size + 'px';
          el.removeAttribute('size');
        });
        this.debouncedSave();
      }
    }
  }

  applyTextColor(color) {
    document.execCommand('foreColor', false, color);
    this.debouncedSave();
  }

  syncElementToReceiptData(element) {
    const classList = Array.from(element.classList);
    const content = this.validateString(element.textContent.trim());
    let isCompanyData = false;

    if (classList.includes('company-name')) {
      this.receiptData.company.name = content;
      isCompanyData = true;
    } else if (classList.includes('company-address')) {
      this.receiptData.company.address = content;
      isCompanyData = true;
    } else if (classList.includes('company-phone')) {
      // ลบข้อความ "โทร: " ออกหากมี
      const phoneContent = content.replace(/^โทร:\s*/, '').trim();
      this.receiptData.company.phone = phoneContent;
      isCompanyData = true;
    } else if (classList.includes('company-email')) {
      // ลบข้อความ "อีเมล: " ออกหากมี
      const emailContent = content.replace(/^อีเมล:\s*/, '').trim();
      this.receiptData.company.email = emailContent;
      isCompanyData = true;
    } else if (classList.includes('company-tax-id')) {
      // ลบข้อความ "เลขประจำตัวผู้เสียภาษี: " ออกหากมี
      const taxIdContent = content.replace(/^เลขประจำตัวผู้เสียภาษี:\s*/, '').trim();
      this.receiptData.company.taxId = taxIdContent;
      isCompanyData = true;
    } else if (classList.includes('customer-name')) {
      this.receiptData.customer.name = content;
    } else if (classList.includes('customer-address')) {
      this.receiptData.customer.address = content;
    } else if (classList.includes('customer-phone')) {
      this.receiptData.customer.phone = content;
    } else if (classList.includes('receipt-number')) {
      // ลบเครื่องหมาย # หากมี
      const receiptNumber = content.replace(/^#/, '').trim();
      this.receiptData.receipt.number = receiptNumber;
    } else if (classList.includes('receipt-date')) {
      this.receiptData.receipt.date = content;
    } else if (classList.includes('receipt-due-date')) {
      this.receiptData.receipt.dueDate = content;
    }

    // บันทึกข้อมูลบริษัทอัตโนมัติเมื่อมีการแก้ไข
    if (isCompanyData) {
      this.debouncedSaveCompany();
    }
  }

  debouncedSave() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.saveToHistory();
    }, 500);
  }

  debouncedSaveCompany() {
    clearTimeout(this.companySaveTimer);
    this.companySaveTimer = setTimeout(() => {
      this.saveCompanyData();
    }, 1000);
  }

  showEditModeIndicator() {
    let indicator = document.querySelector('.edit-mode-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'edit-mode-indicator';
      indicator.innerHTML = '<i class="fas fa-edit"></i> โหมดแก้ไข';
      document.body.appendChild(indicator);
    }
    indicator.style.display = 'flex';
  }

  hideEditModeIndicator() {
    const indicator = document.querySelector('.edit-mode-indicator');
    if (indicator) {
      indicator.style.display = 'none';
    }
  }

  setupTemplates() {
    this.templates = {
      modern: {
        name: 'โมเดิร์น',
        html: this.getModernTemplate()
      },
      classic: {
        name: 'คลาสสิก',
        html: this.getClassicTemplate()
      },
      minimal: {
        name: 'มินิมอล',
        html: this.getMinimalTemplate()
      }
    };
  }

  selectTemplate(templateName) {
    // Update UI
    document.querySelectorAll('.template-card').forEach(card => {
      card.classList.remove('active');
    });
    document.querySelector(`[data-template="${templateName}"]`).classList.add('active');

    this.currentTemplate = templateName;
    this.receiptPage.innerHTML = this.templates[templateName].html;

    // Populate data into template
    this.populateTemplateData();

    // Make elements editable
    this.makeElementsEditable();

    // Apply WYSIWYG mode if enabled
    if (this.isWYSIWYGMode) {
      this.makeElementsContentEditable(true);
    }

    // อัปเดตข้อความภาษีให้ตรงกับอัตราที่เลือก
    this.updateVatLabel();

    // Enable buttons
    document.getElementById('printReceipt').disabled = false;
    document.getElementById('exportPdf').disabled = false;

    // Save to history
    this.saveToHistory();
  }

  populateTemplateData() {
    // Populate company data
    const companyName = this.receiptPage.querySelector('.company-name');
    if (companyName) companyName.textContent = this.receiptData.company.name;

    const companyAddress = this.receiptPage.querySelector('.company-address');
    if (companyAddress) companyAddress.textContent = this.receiptData.company.address;

    const companyPhone = this.receiptPage.querySelector('.company-phone');
    if (companyPhone) companyPhone.textContent = this.receiptData.company.phone;

    const companyEmail = this.receiptPage.querySelector('.company-email');
    if (companyEmail) companyEmail.textContent = this.receiptData.company.email;

    const companyTaxId = this.receiptPage.querySelector('.company-tax-id');
    if (companyTaxId) companyTaxId.textContent = this.receiptData.company.taxId;

    // Populate customer data
    const customerName = this.receiptPage.querySelector('.customer-name');
    if (customerName) customerName.textContent = this.receiptData.customer.name;

    const customerAddress = this.receiptPage.querySelector('.customer-address');
    if (customerAddress) customerAddress.textContent = this.receiptData.customer.address;

    const customerPhone = this.receiptPage.querySelector('.customer-phone');
    if (customerPhone) customerPhone.textContent = this.receiptData.customer.phone;

    // Populate receipt data
    const receiptNumber = this.receiptPage.querySelector('.receipt-number');
    if (receiptNumber) receiptNumber.textContent = this.receiptData.receipt.number;

    const receiptDate = this.receiptPage.querySelector('.receipt-date');
    if (receiptDate) receiptDate.textContent = this.receiptData.receipt.date;

    const receiptDueDate = this.receiptPage.querySelector('.receipt-due-date');
    if (receiptDueDate) receiptDueDate.textContent = this.receiptData.receipt.dueDate;

    // Populate items table
    this.populateItemsTable();
  }

  populateItemsTable() {
    const itemsTableBody = this.receiptPage.querySelector('.items-table tbody');
    if (!itemsTableBody) return;

    // Clear existing rows except template
    const rows = itemsTableBody.querySelectorAll('tr:not(.item-template)');
    rows.forEach(row => row.remove());

    // Add items
    this.receiptData.items.forEach((item, index) => {
      this.addItemRow(item, index);
    });

    // Update totals
    this.updateTotals();
  }

  makeElementsEditable() {
    const editableElements = this.receiptPage.querySelectorAll('.editable');
    editableElements.forEach(element => {
      // Basic click handler for selection (always active)
      element.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectElement(element);
      });

      // Input handler for traditional editing
      element.addEventListener('input', () => {
        if (!this.isWYSIWYGMode) {
          this.saveToHistory();
        }
      });

      element.addEventListener('blur', () => {
        if (!this.isWYSIWYGMode) {
          this.saveToHistory();
        }
      });
    });

    // Setup add/remove buttons for items table
    this.setupItemTableControls();
  }

  setupItemTableControls() {
    // Setup existing remove buttons
    this.setupRemoveButtons();
  }

  setupRemoveButtons() {
    const removeButtons = this.receiptPage.querySelectorAll('.remove-item-btn');
    removeButtons.forEach((button) => {
      button.addEventListener('click', (e) => {
        const row = e.target.closest('tr');
        this.deleteRow(row);
      });
    });
  }

  addNewItem() {
    const newItem = {
      description: 'สินค้า/บริการใหม่',
      quantity: 1,
      price: 0,
      total: 0
    };

    this.receiptData.items.push(newItem);
    this.addItemRow(newItem, this.receiptData.items.length - 1);
    this.updateTotals();
    this.saveToHistory();
  }

  addItemRow(item, index) {
    const itemsTableBody = this.receiptPage.querySelector('.items-table tbody');
    if (!itemsTableBody) return;

    const row = document.createElement('tr');
    row.className = 'item-row';
    row.innerHTML = `
      <td class="editable item-description">${item.description}</td>
      <td class="editable item-quantity" data-type="number">${item.quantity}</td>
      <td class="editable item-price" data-type="number">${item.price.toLocaleString()}</td>
      <td class="item-total">${item.total.toLocaleString()}</td>
      <td class="item-actions">
        <button type="button" class="remove-item-btn" title="ลบรายการ">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;

    itemsTableBody.appendChild(row);

    // Setup event listeners for this row
    this.setupRowEventListeners(row, index);
  }

  setupRowEventListeners(row, index) {
    const descriptionCell = row.querySelector('.item-description');
    const quantityCell = row.querySelector('.item-quantity');
    const priceCell = row.querySelector('.item-price');
    const totalCell = row.querySelector('.item-total');
    const removeBtn = row.querySelector('.remove-item-btn');

    // Description change
    descriptionCell.addEventListener('input', () => {
      this.receiptData.items[index].description = this.validateString(descriptionCell.textContent);
      this.debouncedSave();
    });

    // Quantity change
    quantityCell.addEventListener('input', () => {
      const quantity = this.validateNumber(quantityCell.textContent);
      this.receiptData.items[index].quantity = quantity;
      this.updateItemTotal(index);
      this.debouncedSave();
    });

    // Price change
    priceCell.addEventListener('input', () => {
      const priceText = priceCell.textContent.replace(/,/g, '');
      const price = this.validateNumber(priceText);
      this.receiptData.items[index].price = price;
      this.updateItemTotal(index);
      this.debouncedSave();
    });

    // Remove button
    removeBtn.addEventListener('click', (e) => {
      this.deleteRow(row);
    });

    // Make editable if in WYSIWYG mode
    if (this.isWYSIWYGMode) {
      descriptionCell.setAttribute('contenteditable', 'true');
      quantityCell.setAttribute('contenteditable', 'true');
      priceCell.setAttribute('contenteditable', 'true');
    }
  }

  updateItemTotal(index) {
    const item = this.receiptData.items[index];
    item.total = item.quantity * item.price;

    // Update display
    const rows = this.receiptPage.querySelectorAll('.item-row');
    if (rows[index]) {
      const totalCell = rows[index].querySelector('.item-total');
      totalCell.textContent = item.total.toLocaleString();
    }

    this.updateTotals();
  }



  updateTotals() {
    const subtotal = this.receiptData.items.reduce((sum, item) => sum + item.total, 0);
    const vat = subtotal * 0.07; // 7% VAT
    const total = subtotal + vat;

    this.receiptData.totals = {
      subtotal: subtotal,
      vat: vat,
      total: total
    };

    // Update display
    const subtotalElement = this.receiptPage.querySelector('.subtotal');
    if (subtotalElement) subtotalElement.textContent = subtotal.toLocaleString();

    const vatElement = this.receiptPage.querySelector('.vat');
    if (vatElement) vatElement.textContent = vat.toLocaleString();

    const totalElement = this.receiptPage.querySelector('.total');
    if (totalElement) totalElement.textContent = total.toLocaleString();
  }

  selectElement(element) {
    // Remove previous selection
    if (this.selectedElement) {
      this.selectedElement.classList.remove('selected');
    }

    // Select new element
    this.selectedElement = element;
    element.classList.add('selected');
  }

  deselectElement() {
    if (this.selectedElement) {
      this.selectedElement.classList.remove('selected');
      this.selectedElement = null;
    }
  }

  updatePrimaryColor(color) {
    document.documentElement.style.setProperty('--primary-color', color);
    const primaryElements = this.receiptPage.querySelectorAll('.receipt-header, .items-table th, .receipt-title');
    primaryElements.forEach(el => {
      if (el.classList.contains('items-table')) {
        el.style.backgroundColor = color;
      } else {
        el.style.color = color;
      }
    });
  }

  updateSecondaryColor(color) {
    document.documentElement.style.setProperty('--secondary-color', color);
  }

  updateFontFamily(font) {
    this.receiptPage.style.fontFamily = font;
  }

  showLogoModal() {
    this.logoModal.classList.add('show');
  }

  hideModal() {
    this.logoModal.classList.remove('show');
  }

  handleLogoUpload(event) {
    const file = event.target.files[0];
    if (file) {
      this.processLogoFile(file);
    }
  }

  processLogoFile(file) {
    if (!file.type.startsWith('image/')) {
      alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const logoContainer = this.receiptPage.querySelector('.company-logo');
      if (logoContainer) {
        logoContainer.innerHTML = `<img src="${e.target.result}" alt="โลโก้บริษัท" style="max-width: 150px; max-height: 80px;">`;
      } else {
        // Add logo to header
        const header = this.receiptPage.querySelector('.receipt-header .company-info');
        if (header) {
          const logoDiv = document.createElement('div');
          logoDiv.className = 'company-logo';
          logoDiv.innerHTML = `<img src="${e.target.result}" alt="โลโก้บริษัท" style="max-width: 150px; max-height: 80px; margin-bottom: 1rem;">`;
          header.insertBefore(logoDiv, header.firstChild);
        }
      }
      this.hideModal();
      this.saveToHistory();
    };
    reader.readAsDataURL(file);
  }

  addField() {
    const field = document.createElement('div');
    field.className = 'editable custom-field';
    field.contentEditable = true;
    field.textContent = 'ฟิลด์ใหม่';
    field.style.margin = '0.5rem 0';
    field.style.padding = '0.5rem';
    field.style.border = '1px dashed #ccc';

    // Add to customer section
    const customerSection = this.receiptPage.querySelector('.customer-section');
    if (customerSection) {
      customerSection.appendChild(field);
      this.makeElementsEditable();
      this.saveToHistory();
    }
  }

  zoomIn() {
    if (this.zoomLevel < 200) {
      this.zoomLevel += 10;
      this.updateZoom();
    }
  }

  zoomOut() {
    if (this.zoomLevel > 50) {
      this.zoomLevel -= 10;
      this.updateZoom();
    }
  }

  updateZoom() {
    this.receiptPage.style.transform = `scale(${this.zoomLevel / 100})`;
    this.receiptPage.style.transformOrigin = 'top center';
    document.querySelector('.zoom-level').textContent = this.zoomLevel + '%';
  }

  saveToHistory() {
    const state = {
      html: this.receiptPage.innerHTML,
      template: this.currentTemplate,
      timestamp: Date.now()
    };

    // Remove future states if we're not at the end
    this.history = this.history.slice(0, this.historyIndex + 1);

    // Add new state
    this.history.push(state);
    this.historyIndex = this.history.length - 1;

    // Limit history size
    if (this.history.length > 50) {
      this.history = this.history.slice(-50);
      this.historyIndex = this.history.length - 1;
    }
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      const state = this.history[this.historyIndex];
      this.receiptPage.innerHTML = state.html;
      this.currentTemplate = state.template;
      this.makeElementsEditable();
      this.deselectElement();
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      const state = this.history[this.historyIndex];
      this.receiptPage.innerHTML = state.html;
      this.currentTemplate = state.template;
      this.makeElementsEditable();
      this.deselectElement();
    }
  }

  newReceipt() {
    if (confirm('สร้างใบเสร็จใหม่? ข้อมูลปัจจุบันจะหายไป')) {
      this.receiptPage.innerHTML = `
                <div class="welcome-message">
                    <i class="fas fa-arrow-left"></i>
                    <p>เลือกเทมเพลตจากด้านซ้ายเพื่อเริ่มออกแบบใบเสร็จ</p>
                </div>
            `;
      this.currentTemplate = null;
      this.deselectElement();
      document.getElementById('printReceipt').disabled = true;
      document.getElementById('exportPdf').disabled = true;

      // Clear template selection
      document.querySelectorAll('.template-card').forEach(card => {
        card.classList.remove('active');
      });
    }
  }

  printReceipt() {
    if (this.currentTemplate) {
      window.print();
    }
  }

  async exportToPDF() {
    if (!this.currentTemplate) return;

    try {
      // Show loading indicator
      const exportBtn = document.getElementById('exportPdf');
      const originalText = exportBtn.innerHTML;
      exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังสร้าง PDF...';
      exportBtn.disabled = true;

      // Get the receipt page element
      const receiptElement = document.getElementById('receiptPage');

      // Temporarily hide selection highlights and management buttons
      const selectedElements = receiptElement.querySelectorAll('.selected');
      const actionButtons = receiptElement.querySelectorAll('.item-actions, .table-actions, .action-btn, .remove-item-btn');

      selectedElements.forEach(el => {
        el.classList.remove('selected');
        el.style.outline = 'none';
        el.style.background = 'transparent';
      });

      actionButtons.forEach(el => {
        el.style.display = 'none';
      });

      // Clone the element to avoid modifying the original
      const clonedElement = receiptElement.cloneNode(true);

      // Add PDF optimization class
      clonedElement.classList.add('pdf-optimized');

      // Clean up cloned element for PDF - remove all management elements
      const clonedActionElements = clonedElement.querySelectorAll(
        '.item-actions, .table-actions, .action-btn, .remove-item-btn, .toolbar-btn'
      );
      clonedActionElements.forEach(el => el.remove());

      // Remove management column headers and adjust table structure
      const tables = clonedElement.querySelectorAll('table');
      tables.forEach(table => {
        // Remove management column header
        const headers = table.querySelectorAll('th');
        headers.forEach(header => {
          if (header.textContent.includes('จัดการ') || header.textContent.includes('Management')) {
            header.remove();
          }
        });

        // Remove management cells from all rows
        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          cells.forEach(cell => {
            if (cell.classList.contains('item-actions') ||
              cell.querySelector('.remove-item-btn') ||
              cell.querySelector('.action-btn')) {
              cell.remove();
            }
          });
        });
      });

      // Enhance styling for PDF with explicit color settings
      clonedElement.style.transform = 'scale(1)';
      clonedElement.style.transformOrigin = 'top left';
      clonedElement.style.boxShadow = 'none';
      clonedElement.style.border = 'none';
      clonedElement.style.background = '#ffffff';
      clonedElement.style.backgroundColor = '#ffffff';

      // Force all elements to have proper colors and backgrounds
      const allElements = clonedElement.querySelectorAll('*');
      allElements.forEach(el => {
        // Remove any problematic styling
        el.style.textRendering = 'optimizeLegibility';
        el.style.webkitFontSmoothing = 'antialiased';
        el.style.mozOsxFontSmoothing = 'grayscale';

        // Force text color
        if (!el.style.color || el.style.color === '') {
          el.style.color = '#000000';
        }

        // Ensure no transparent backgrounds that might cause issues
        if (el.style.backgroundColor === 'transparent' || el.style.backgroundColor === '') {
          el.style.backgroundColor = 'inherit';
        }

        // Remove shadows and effects
        el.style.boxShadow = 'none';
        el.style.textShadow = 'none';
        el.style.filter = 'none';

        // Fix gradient backgrounds to solid colors
        if (el.style.background && el.style.background.includes('gradient')) {
          el.style.background = '#ffffff';
          el.style.backgroundColor = '#ffffff';
        }
      });

      // Fix table styling specifically
      const pdfTables = clonedElement.querySelectorAll('table');
      pdfTables.forEach(table => {
        table.style.pageBreakInside = 'avoid';
        table.style.borderCollapse = 'collapse';
        table.style.width = '100%';
        table.style.backgroundColor = '#ffffff';
        table.style.color = '#000000';

        // Fix table cell padding and borders
        const cells = table.querySelectorAll('th, td');
        cells.forEach(cell => {
          cell.style.padding = '8px';
          cell.style.border = '1px solid #333333';
          cell.style.fontSize = '14px';
          cell.style.lineHeight = '1.4';
          cell.style.color = '#000000';
          cell.style.backgroundColor = '#ffffff';
        });

        // Style table headers with visible background
        const headers = table.querySelectorAll('th');
        headers.forEach(th => {
          th.style.backgroundColor = '#f5f5f5';
          th.style.color = '#000000';
          th.style.fontWeight = '600';
          th.style.textAlign = 'center';
        });
      });

      // Fix number alignment in tables
      const numberCells = clonedElement.querySelectorAll('.item-quantity, .item-price, .item-total');
      numberCells.forEach(cell => {
        cell.style.textAlign = 'right';
        cell.style.fontFamily = 'monospace, Sarabun';
      });      // Create a temporary container optimized for PDF rendering
      const tempContainer = document.createElement('div');
      tempContainer.style.cssText = `
        position: absolute;
        left: -9999px;
        top: 0;
        width: 794px;
        min-height: 1123px;
        padding: 40px;
        background: #ffffff !important;
        background-color: #ffffff !important;
        font-family: 'Sarabun', Arial, sans-serif;
        font-size: 14px;
        line-height: 1.4;
        color: #000000 !important;
        box-sizing: border-box;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        overflow: visible;
      `;

      // Ensure cloned element has proper styling
      clonedElement.style.cssText = `
        background: #ffffff !important;
        background-color: #ffffff !important;
        color: #000000 !important;
        width: 100% !important;
        min-height: auto !important;
        padding: 0 !important;
        margin: 0 !important;
        box-shadow: none !important;
        border: none !important;
      `;

      tempContainer.appendChild(clonedElement);
      document.body.appendChild(tempContainer);

      // Wait for fonts to load
      await document.fonts.ready;

      // Add a delay to ensure proper rendering
      await new Promise(resolve => setTimeout(resolve, 500));

      // Generate canvas with debug settings
      console.log('Starting PDF generation...');
      const canvas = await html2canvas(tempContainer, {
        scale: 1.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: true,
        removeContainer: false,
        imageTimeout: 10000,
        scrollX: 0,
        scrollY: 0,
        windowWidth: 794,
        windowHeight: 1123,
        onclone: (clonedDoc) => {
          // Force all elements in cloned document to have proper colors
          const allEls = clonedDoc.querySelectorAll('*');
          allEls.forEach(el => {
            el.style.color = '#000000';
            if (el.style.backgroundColor === 'transparent') {
              el.style.backgroundColor = '#ffffff';
            }
          });
          console.log('Canvas cloning completed');
        },
        ignoreElements: (element) => {
          return element.classList.contains('item-actions') ||
            element.classList.contains('table-actions') ||
            element.classList.contains('action-btn');
        }
      });

      console.log('Canvas generated:', canvas.width, 'x', canvas.height);

      // Check if canvas is valid and not completely black
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, Math.min(100, canvas.width), Math.min(100, canvas.height));
      const pixels = imageData.data;
      let isAllBlack = true;

      // Check first 100x100 pixels to see if it's all black
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        if (r > 10 || g > 10 || b > 10) { // Allow for slight variations
          isAllBlack = false;
          break;
        }
      }

      if (isAllBlack) {
        console.warn('Canvas appears to be all black, attempting alternative method...');

        // Show debug canvas to user
        const debugDiv = document.createElement('div');
        debugDiv.style.cssText = `
          position: fixed;
          top: 10px;
          right: 10px;
          z-index: 10000;
          background: white;
          border: 2px solid red;
          padding: 10px;
          max-width: 300px;
        `;
        debugDiv.innerHTML = `
          <p style="color: red; margin: 0 0 10px 0;">Debug: Canvas รูปแบบไม่ถูกต้อง</p>
          <canvas id="debugCanvas" style="max-width: 280px; border: 1px solid #ccc;"></canvas>
          <button onclick="this.parentElement.remove()" style="margin-top: 10px;">ปิด</button>
        `;
        document.body.appendChild(debugDiv);

        const debugCanvas = debugDiv.querySelector('#debugCanvas');
        debugCanvas.width = Math.min(280, canvas.width);
        debugCanvas.height = Math.min(200, canvas.height);
        const debugCtx = debugCanvas.getContext('2d');
        debugCtx.drawImage(canvas, 0, 0, debugCanvas.width, debugCanvas.height);

        // Try with minimal settings
        const fallbackCanvas = await html2canvas(tempContainer, {
          scale: 1,
          backgroundColor: '#ffffff',
          logging: true,
          useCORS: false,
          allowTaint: false,
          onrendered: (canvas) => {
            console.log('Fallback canvas rendered');
          }
        });

        if (fallbackCanvas && fallbackCanvas.width > 0 && fallbackCanvas.height > 0) {
          console.log('Using fallback canvas');
          canvas = fallbackCanvas;
        } else {
          throw new Error('ไม่สามารถสร้าง Canvas ได้ กรุณาลองใหม่อีกครั้ง');
        }
      }

      // Clean up temporary container
      document.body.removeChild(tempContainer);

      // Restore original elements
      actionButtons.forEach(el => {
        el.style.display = '';
      });

      // Create PDF from canvas
      await this.createPDFFromCanvas(canvas);

    } catch (error) {
      console.error('Export PDF Error:', error);
      this.showNotification('❌ เกิดข้อผิดพลาดในการส่งออก PDF: ' + error.message, 'error');
    } finally {
      // Restore button
      const exportBtn = document.getElementById('exportPdf');
      exportBtn.innerHTML = '<i class="fas fa-file-pdf"></i> Export PDF';
      exportBtn.disabled = false;
    }
  }

  async createPDFFromCanvas(canvas) {
    // Create PDF with better settings
    const {jsPDF} = window.jspdf;
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
      precision: 2
    });

    // Calculate optimal dimensions with better fitting
    const pdfWidth = 210; // A4 width in mm
    const pdfHeight = 297; // A4 height in mm
    const margin = 10; // Small margin for better appearance

    const availableWidth = pdfWidth - (margin * 2);
    const availableHeight = pdfHeight - (margin * 2);

    // Calculate scaling to fit content properly
    const scaleX = availableWidth / (canvas.width / 3.78); // Convert pixels to mm
    const scaleY = availableHeight / (canvas.height / 3.78);
    const scale = Math.min(scaleX, scaleY, 1); // Don't scale up

    const imgWidth = (canvas.width / 3.78) * scale;
    const imgHeight = (canvas.height / 3.78) * scale;

    // Center the content
    const offsetX = margin + (availableWidth - imgWidth) / 2;
    const offsetY = margin;

    // Convert canvas to optimized image with white background
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');

    // Fill with white background first
    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    // Then draw the original canvas on top
    tempCtx.drawImage(canvas, 0, 0);

    const imgData = tempCanvas.toDataURL('image/jpeg', 0.95);

    // Smart page handling
    if (imgHeight <= availableHeight) {
      // Single page - center content
      pdf.addImage(imgData, 'JPEG', offsetX, offsetY, imgWidth, imgHeight);
    } else {
      // Multiple pages with proper breaks
      let currentY = offsetY;
      let remainingHeight = imgHeight;
      let sourceY = 0;

      while (remainingHeight > 0) {
        const currentPageHeight = Math.min(remainingHeight, availableHeight);
        const sourceHeight = (currentPageHeight / imgHeight) * canvas.height;

        // Create canvas section for current page
        const pageCanvas = document.createElement('canvas');
        const pageCtx = pageCanvas.getContext('2d');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sourceHeight;

        // Fill with white background
        pageCtx.fillStyle = '#ffffff';
        pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

        // Draw section of original canvas
        pageCtx.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, canvas.width, sourceHeight);

        const pageImgData = pageCanvas.toDataURL('image/jpeg', 0.95);

        // Add to PDF
        pdf.addImage(pageImgData, 'JPEG', offsetX, currentY, imgWidth, currentPageHeight);

        // Prepare for next page
        remainingHeight -= currentPageHeight;
        sourceY += sourceHeight;

        if (remainingHeight > 0) {
          pdf.addPage();
          currentY = offsetY;
        }
      }
    }

    // Add metadata to PDF
    pdf.setProperties({
      title: `ใบเสร็จรับเงิน ${this.receiptData.receipt.number}`,
      subject: 'Receipt',
      author: this.receiptData.company.name,
      creator: 'Receipt Designer',
      producer: 'Receipt Designer'
    });

    // Generate clean filename
    const receiptNumber = this.receiptData.receipt.number?.replace(/[^a-zA-Z0-9]/g, '') || 'R001';
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
    const filename = `Receipt-${receiptNumber}-${dateStr}-${timeStr}.pdf`;

    // Save PDF
    pdf.save(filename);

    // Success message with file info
    this.showNotification(`✅ ส่งออก PDF สำเร็จ! ไฟล์: ${filename}`, 'success');
  }

  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 1rem 1.5rem;
      border-radius: 6px;
      color: white;
      font-weight: 500;
      z-index: 10000;
      max-width: 300px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transform: translateX(100%);
      transition: transform 0.3s ease;
    `;

    // Set background color based on type
    switch (type) {
      case 'success':
        notification.style.background = '#27ae60';
        break;
      case 'error':
        notification.style.background = '#e74c3c';
        break;
      default:
        notification.style.background = '#3498db';
    }

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
      notification.style.transform = 'translateX(0)';
    }, 100);

    // Auto remove after 3 seconds
    setTimeout(() => {
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notification.parentNode) {
          document.body.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  // รายการสินค้า Methods
  addRow() {
    if (!this.currentTemplate) return;

    const table = this.receiptPage.querySelector('.items-table tbody');
    if (!table) return;

    const newIndex = table.children.length;
    const newRow = document.createElement('tr');
    newRow.setAttribute('data-row-index', newIndex);

    // สร้างแถวใหม่ตามรูปแบบของเทมเพลต
    if (this.currentTemplate === 'modern') {
      newRow.innerHTML = `
        <td class="editable item-description">รายการใหม่</td>
        <td class="editable item-quantity" data-type="number">1</td>
        <td class="editable item-price" data-type="number">0</td>
        <td class="editable item-total" data-type="number">0</td>
        <td class="item-actions">
          <button class="action-btn delete-row" title="ลบรายการ" onclick="receiptDesigner.deleteRow(${newIndex})">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      `;
    } else if (this.currentTemplate === 'classic') {
      newRow.style.borderBottom = '1px solid #2c3e50';
      newRow.innerHTML = `
        <td class="editable item-description">รายการใหม่</td>
        <td class="editable item-quantity" style="text-align: center;" data-type="number">1</td>
        <td class="editable item-price" style="text-align: right;" data-type="number">0</td>
        <td class="editable item-total" style="text-align: right;" data-type="number">0</td>
        <td class="item-actions" style="text-align: center;">
          <button class="action-btn delete-row" title="ลบรายการ" onclick="receiptDesigner.deleteRow(${newIndex})">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      `;
    } else if (this.currentTemplate === 'minimal') {
      newRow.style.borderBottom = '1px solid #f5f5f5';
      newRow.innerHTML = `
        <td class="editable item-description" style="padding: 0.75rem 0;">รายการใหม่</td>
        <td class="editable item-quantity" style="padding: 0.75rem 0; text-align: center;" data-type="number">1</td>
        <td class="editable item-price" style="padding: 0.75rem 0; text-align: right;" data-type="number">0</td>
        <td class="editable item-total" style="padding: 0.75rem 0; text-align: right;" data-type="number">0</td>
        <td class="item-actions" style="padding: 0.75rem 0; text-align: center;">
          <button class="action-btn delete-row" title="ลบรายการ" onclick="receiptDesigner.deleteRow(${newIndex})" style="background: none; border: none; color: #e74c3c; cursor: pointer; font-size: 0.8rem;">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      `;
    }

    table.appendChild(newRow);

    // อัปเดต index ของแถวทั้งหมด
    this.updateRowIndexes();

    // ทำให้แถวใหม่แก้ไขได้
    this.makeElementsEditable();

    // เพิ่มข้อมูลในอาร์เรย์
    this.receiptData.items.push({
      description: 'รายการใหม่',
      quantity: 1,
      price: 0,
      total: 0
    });

    // คำนวณยอดรวมใหม่
    this.calculateTotals();

    this.saveToHistory();
    this.showNotification('✅ เพิ่มรายการใหม่แล้ว', 'success');
  }

  deleteRow(indexOrRow) {
    if (!this.currentTemplate) return;

    const table = this.receiptPage.querySelector('.items-table tbody, .items-table');
    const rows = table.querySelectorAll('tr');

    if (rows.length <= 1) {
      this.showNotification('⚠️ ต้องมีรายการอย่างน้อย 1 รายการ', 'error');
      return;
    }

    let index;
    let targetRow;

    // ตรวจสอบว่าส่งมา index หรือ DOM element
    if (typeof indexOrRow === 'number') {
      index = indexOrRow;
      targetRow = rows[index];
    } else {
      // ส่งมา DOM element
      targetRow = indexOrRow;
      index = Array.from(rows).indexOf(targetRow);
    }

    if (index >= 0 && index < rows.length && targetRow) {
      // ลบแถวจาก DOM
      targetRow.remove();

      // ลบข้อมูลจากอาร์เรย์
      this.receiptData.items.splice(index, 1);

      // อัปเดต index ของแถวทั้งหมด
      this.updateRowIndexes();

      // คำนวณยอดรวมใหม่
      this.calculateTotals();

      this.saveToHistory();
      this.showNotification('✅ ลบรายการแล้ว', 'success');
    }
  }

  updateRowIndexes() {
    const table = this.receiptPage.querySelector('.items-table tbody, .items-table');
    const rows = table.querySelectorAll('tr');

    rows.forEach((row, index) => {
      row.setAttribute('data-row-index', index);
      const deleteBtn = row.querySelector('.delete-row');
      if (deleteBtn) {
        deleteBtn.setAttribute('onclick', `receiptDesigner.deleteRow(${index})`);
      }
    });
  }

  calculateTotals() {
    if (!this.currentTemplate) return;

    const table = this.receiptPage.querySelector('.items-table tbody');
    const rows = table.querySelectorAll('tr');

    let subtotal = 0;

    // คำนวณยอดรวมของแต่ละรายการ และรวมทั้งหมด
    rows.forEach((row, index) => {
      const quantityEl = row.querySelector('.item-quantity');
      const priceEl = row.querySelector('.item-price');
      const totalEl = row.querySelector('.item-total');

      if (quantityEl && priceEl && totalEl) {
        const quantity = parseFloat(quantityEl.textContent.replace(/,/g, '')) || 0;
        const price = parseFloat(priceEl.textContent.replace(/,/g, '')) || 0;
        const total = quantity * price;

        // อัปเดตยอดรวมในตาราง
        totalEl.textContent = total.toLocaleString();

        // อัปเดตข้อมูลในอาร์เรย์
        if (this.receiptData.items[index]) {
          this.receiptData.items[index].quantity = quantity;
          this.receiptData.items[index].price = price;
          this.receiptData.items[index].total = total;
        }

        subtotal += total;
      }
    });

    // คำนวณภาษี
    const vatSelector = document.getElementById('vatRate');
    const vatRate = vatSelector ? (parseFloat(vatSelector.value) / 100) : 0.07;
    const vat = subtotal * vatRate;
    const total = subtotal + vat;

    // อัปเดตข้อมูลยอดรวม
    this.receiptData.totals.subtotal = subtotal;
    this.receiptData.totals.vat = vat;
    this.receiptData.totals.total = total;

    // อัปเดตการแสดงผลยอดรวม
    this.updateTotalDisplay();

    this.saveToHistory();
    this.showNotification('✅ คำนวณยอดรวมแล้ว', 'success');
  }

  updateTotalDisplay() {
    const subTotal = document.getElementById('subTotal');
    const vatTotal = document.getElementById('vatTotal');
    const grandTotal = document.getElementById('grandTotal');
    if (subTotal) {
      subTotal.textContent = this.receiptData.totals.subtotal.toLocaleString();
    }
    if (vatTotal) {
      vatTotal.textContent = this.receiptData.totals.vat.toLocaleString();
    }
    if (grandTotal) {
      grandTotal.textContent = this.receiptData.totals.total.toLocaleString();
    }

    // อัปเดตข้อความภาษีให้ตรงกับอัตราที่เลือก
    this.updateVatLabel();
  }

  // อัปเดต makeElementsEditable เพื่อจัดการการเปลี่ยนแปลงตัวเลข
  makeElementsEditable() {
    const editableElements = this.receiptPage.querySelectorAll('.editable');
    editableElements.forEach(element => {
      // ลบ event listeners เก่า
      element.removeEventListener('click', this.selectElementHandler);
      element.removeEventListener('input', this.inputHandler);
      element.removeEventListener('blur', this.blurHandler);

      // เพิ่ม event listeners ใหม่
      this.selectElementHandler = (e) => {
        e.stopPropagation();
        this.selectElement(element);
      };

      this.inputHandler = () => {
        // ถ้าเป็นฟิลด์ตัวเลขในตาราง ให้คำนวณใหม่
        if (element.dataset.type === 'number' ||
          element.classList.contains('item-quantity') ||
          element.classList.contains('item-price')) {
          setTimeout(() => this.calculateTotals(), 300);
        }
        this.saveToHistory();
      };

      this.blurHandler = () => {
        this.saveToHistory();
      };

      element.addEventListener('click', this.selectElementHandler);
      element.addEventListener('input', this.inputHandler);
      element.addEventListener('blur', this.blurHandler);
    });
  }

  // Template Methods
  getModernTemplate() {
    return `
            <div class="receipt-header">
                <div class="company-info">
                    <h1 class="editable company-name">${this.receiptData.company.name}</h1>
                    <p class="editable company-address">${this.receiptData.company.address}</p>
                    <p class="editable company-phone">โทร: ${this.receiptData.company.phone}</p>
                    <p class="editable company-email">อีเมล: ${this.receiptData.company.email}</p>
                    <p class="editable company-tax-id">เลขประจำตัวผู้เสียภาษี: ${this.receiptData.company.taxId}</p>
                </div>
                <div class="receipt-info">
                    <h2 class="receipt-title editable">ใบเสร็จรับเงิน</h2>
                    <div class="receipt-details">
                        <div class="detail-row">
                            <span>เลขที่:</span>
                            <span class="editable">${this.receiptData.receipt.number}</span>
                        </div>
                        <div class="detail-row">
                            <span>วันที่:</span>
                            <span class="editable">${this.receiptData.receipt.date}</span>
                        </div>
                        <div class="detail-row">
                            <span>ครบกำหนด:</span>
                            <span class="editable">${this.receiptData.receipt.dueDate}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="customer-section">
                <h3>ลูกค้า</h3>
                <p class="editable customer-name">${this.receiptData.customer.name}</p>
                <p class="editable">${this.receiptData.customer.address}</p>
                <p class="editable">โทร: ${this.receiptData.customer.phone}</p>
            </div>

            <table class="items-table">
                <thead>
                    <tr>
                        <th class="editable">รายการ</th>
                        <th class="editable">จำนวน</th>
                        <th class="editable">ราคาต่อหน่วย</th>
                        <th class="editable">รวม</th>
                        <th class="item-actions" width="80">จัดการ</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.receiptData.items.map((item, index) => `
                        <tr data-row-index="${index}">
                            <td class="editable item-description">${item.description}</td>
                            <td class="editable item-quantity" data-type="number">${item.quantity}</td>
                            <td class="editable item-price" data-type="number">${item.price.toLocaleString()}</td>
                            <td class="item-total">${item.total.toLocaleString()}</td>
                            <td class="item-actions">
                                <button class="remove-item-btn" title="ลบรายการ">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="total-section">
                <div class="total-box">
                    <div class="total-row">
                        <span>ยอดรวม:</span>
                        <span id=subTotal>${this.receiptData.totals.subtotal.toLocaleString()}</span>
                    </div>
                    <div class="total-row">
                        <span id="vatLabel">ภาษีมูลค่าเพิ่ม:</span>
                        <span id=vatTotal>${this.receiptData.totals.vat.toLocaleString()}</span>
                    </div>
                    <div class="total-row">
                        <span>รวมทั้งสิ้น:</span>
                        <span id=grandTotal>${this.receiptData.totals.total.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            <div class="footer-section">
                <p class="editable">ขอบคุณสำหรับการใช้บริการ</p>
                <p class="editable">โปรดเก็บใบเสร็จนี้ไว้เป็นหลักฐาน</p>
            </div>
        `;
  }

  getClassicTemplate() {
    return `
            <div style="text-align: center; margin-bottom: 2rem; border-bottom: 3px double #2c3e50; padding-bottom: 1rem;">
                <h1 class="editable company-name" style="font-size: 2rem; margin-bottom: 0.5rem;">${this.receiptData.company.name}</h1>
                <p class="editable company-address" style="margin-bottom: 0.25rem;">${this.receiptData.company.address}</p>
                <p class="editable company-phone">โทร: ${this.receiptData.company.phone} | <span class="editable company-email">อีเมล: ${this.receiptData.company.email}</span></p>
                <p class="editable company-tax-id">เลขประจำตัวผู้เสียภาษี: ${this.receiptData.company.taxId}</p>
            </div>

            <div style="text-align: center; margin-bottom: 2rem;">
                <h2 class="receipt-title editable" style="font-size: 1.8rem; color: #2c3e50; text-decoration: underline;">ใบเสร็จรับเงิน</h2>
            </div>

            <div style="display: flex; justify-content: space-between; margin-bottom: 2rem;">
                <div>
                    <p><strong>เลขที่:</strong> <span class="editable">${this.receiptData.receipt.number}</span></p>
                    <p><strong>วันที่:</strong> <span class="editable">${this.receiptData.receipt.date}</span></p>
                </div>
                <div>
                    <p><strong>ครบกำหนด:</strong> <span class="editable">${this.receiptData.receipt.dueDate}</span></p>
                </div>
            </div>

            <div class="customer-section" style="margin-bottom: 2rem; padding: 1rem; background: #f8f9fa; border-left: 4px solid #2c3e50;">
                <h3 style="margin-bottom: 1rem;">รายละเอียดลูกค้า</h3>
                <p><strong>ชื่อ:</strong> <span class="editable customer-name">${this.receiptData.customer.name}</span></p>
                <p><strong>ที่อยู่:</strong> <span class="editable">${this.receiptData.customer.address}</span></p>
                <p><strong>โทรศัพท์:</strong> <span class="editable">${this.receiptData.customer.phone}</span></p>
            </div>

            <table class="items-table" style="border: 2px solid #2c3e50;">
                <thead>
                    <tr style="background: #2c3e50;">
                        <th class="editable">รายการสินค้า/บริการ</th>
                        <th class="editable">จำนวน</th>
                        <th class="editable">ราคาต่อหน่วย (บาท)</th>
                        <th class="editable">จำนวนเงิน (บาท)</th>
                        <th class="item-actions" width="80" style="color: white;">จัดการ</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.receiptData.items.map((item, index) => `
                        <tr style="border-bottom: 1px solid #2c3e50;" data-row-index="${index}">
                            <td class="editable item-description">${item.description}</td>
                            <td class="editable item-quantity" style="text-align: center;" data-type="number">${item.quantity}</td>
                            <td class="editable item-price" style="text-align: right;" data-type="number">${item.price.toLocaleString()}</td>
                            <td class="item-total" style="text-align: right;">${item.total.toLocaleString()}</td>
                            <td class="item-actions" style="text-align: center;">
                                <button class="remove-item-btn" title="ลบรายการ">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div style="display: flex; justify-content: flex-end; margin: 2rem 0;">
                <div style="border: 2px solid #2c3e50; padding: 1rem; background: white;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; min-width: 200px;">
                        <span>รวมเป็นเงิน:</span>
                        <span>${this.receiptData.totals.subtotal.toLocaleString()} บาท</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                        <span id="vatLabel">ภาษีมูลค่าเพิ่ม:</span>
                        <span>${this.receiptData.totals.vat.toLocaleString()} บาท</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 1.1rem; border-top: 1px solid #2c3e50; padding-top: 0.5rem;">
                        <span>รวมทั้งสิ้น:</span>
                        <span>${this.receiptData.totals.total.toLocaleString()} บาท</span>
                    </div>
                </div>
            </div>

            <div style="text-align: center; margin-top: 3rem; border-top: 1px solid #ccc; padding-top: 1rem;">
                <p class="editable" style="font-style: italic;">ขอบพระคุณที่ใช้บริการ</p>
                <p class="editable" style="font-size: 0.9rem; color: #666;">กรุณาเก็บใบเสร็จนี้ไว้เป็นหลักฐานการชำระเงิน</p>
            </div>
        `;
  }

  getMinimalTemplate() {
    return `
            <div style="margin-bottom: 3rem;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem;">
                    <div>
                        <h1 class="editable company-name" style="font-size: 1.5rem; font-weight: 300; margin-bottom: 0.5rem;">${this.receiptData.company.name}</h1>
                        <p class="editable company-email" style="color: #666; font-size: 0.9rem;">${this.receiptData.company.email}</p>
                    </div>
                    <div style="text-align: right;">
                        <h2 class="receipt-title editable" style="font-size: 1.2rem; font-weight: 300; color: #333;">RECEIPT</h2>
                        <p class="editable receipt-number" style="color: #666; font-size: 0.9rem;">#${this.receiptData.receipt.number}</p>
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; margin-bottom: 3rem; font-size: 0.9rem;">
                    <div>
                        <p style="color: #999; margin-bottom: 0.25rem;">จาก</p>
                        <p class="editable company-name" style="margin-bottom: 0.25rem;">${this.receiptData.company.name}</p>
                        <p class="editable company-address" style="color: #666;">${this.receiptData.company.address}</p>
                    </div>
                    <div style="text-align: right;">
                        <p style="color: #999; margin-bottom: 0.25rem;">ถึง</p>
                        <p class="editable customer-name" style="margin-bottom: 0.25rem;">${this.receiptData.customer.name}</p>
                        <p class="editable" style="color: #666;">${this.receiptData.customer.address}</p>
                    </div>
                </div>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 2rem; font-size: 0.9rem;">
                <thead>
                    <tr style="border-bottom: 1px solid #eee;">
                        <th class="editable" style="text-align: left; padding: 0.75rem 0; font-weight: 500; color: #666;">รายการ</th>
                        <th class="editable" style="text-align: center; padding: 0.75rem 0; font-weight: 500; color: #666;">จำนวน</th>
                        <th class="editable" style="text-align: right; padding: 0.75rem 0; font-weight: 500; color: #666;">ราคา</th>
                        <th class="editable" style="text-align: right; padding: 0.75rem 0; font-weight: 500; color: #666;">รวม</th>
                        <th class="item-actions" style="width: 60px; text-align: center; padding: 0.75rem 0; font-weight: 500; color: #666;">จัดการ</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.receiptData.items.map((item, index) => `
                        <tr style="border-bottom: 1px solid #f5f5f5;" data-row-index="${index}">
                            <td class="editable item-description" style="padding: 0.75rem 0;">${item.description}</td>
                            <td class="editable item-quantity" style="padding: 0.75rem 0; text-align: center;" data-type="number">${item.quantity}</td>
                            <td class="editable item-price" style="padding: 0.75rem 0; text-align: right;" data-type="number">${item.price.toLocaleString()}</td>
                            <td class="item-total" style="padding: 0.75rem 0; text-align: right;">${item.total.toLocaleString()}</td>
                            <td class="item-actions" style="padding: 0.75rem 0; text-align: center;">
                                <button class="action-btn delete-row" title="ลบรายการ" onclick="receiptDesigner.deleteRow(${index})" style="background: none; border: none; color: #e74c3c; cursor: pointer; font-size: 0.8rem;">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div style="display: flex; justify-content: flex-end; margin-bottom: 3rem;">
                <div style="min-width: 200px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.9rem;">
                        <span style="color: #666;">ยอดรวม:</span>
                        <span>${this.receiptData.totals.subtotal.toLocaleString()}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.9rem;">
                        <span style="color: #666;" id="vatLabel">ภาษี:</span>
                        <span>${this.receiptData.totals.vat.toLocaleString()}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 1.1rem; font-weight: 500; border-top: 1px solid #eee; padding-top: 0.75rem;">
                        <span>รวมทั้งสิ้น:</span>
                        <span>${this.receiptData.totals.total.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            <div style="text-align: center; color: #999; font-size: 0.8rem;">
                <p class="editable">วันที่: ${this.receiptData.receipt.date}</p>
                <p class="editable" style="margin-top: 1rem;">ขอบคุณสำหรับการใช้บริการ</p>
            </div>
        `;
  }

  // Initialize default mode to preview
  initializeDefaultMode() {
    // Start in preview mode
    this.disableWYSIWYGMode();
  }

  // Enhanced sync function for all editable elements
  syncAllElementsToReceiptData() {
    const editableElements = this.receiptPage.querySelectorAll('.editable');
    editableElements.forEach(element => {
      this.syncElementToReceiptData(element);
    });
  }

  // Update display from receiptData (reverse sync)
  updateDisplayFromReceiptData() {
    this.populateTemplateData();
  }

  // Security functions for XSS prevention
  sanitizeHTML(str) {
    if (typeof str !== 'string') return '';

    // Create a temporary div to safely extract text content
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
  }

  sanitizeInput(input) {
    if (typeof input !== 'string') return '';

    // Remove script tags and dangerous attributes
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .replace(/data:text\/html/gi, '')
      .trim();
  }

  validateNumber(value) {
    const num = parseFloat(value);
    return isNaN(num) ? 0 : Math.max(0, num);
  }

  validateString(value, maxLength = 1000) {
    if (typeof value !== 'string') return '';
    return this.sanitizeInput(value).substring(0, maxLength);
  }

  // Enhanced input validation and CSP protection
  validateReceiptData() {
    // Validate company data
    this.receiptData.company.name = this.validateString(this.receiptData.company.name, 200);
    this.receiptData.company.address = this.validateString(this.receiptData.company.address, 500);
    this.receiptData.company.phone = this.validateString(this.receiptData.company.phone, 50);
    this.receiptData.company.email = this.validateString(this.receiptData.company.email, 100);
    this.receiptData.company.taxId = this.validateString(this.receiptData.company.taxId, 50);

    // Validate customer data
    this.receiptData.customer.name = this.validateString(this.receiptData.customer.name, 200);
    this.receiptData.customer.address = this.validateString(this.receiptData.customer.address, 500);
    this.receiptData.customer.phone = this.validateString(this.receiptData.customer.phone, 50);

    // Validate receipt data
    this.receiptData.receipt.number = this.validateString(this.receiptData.receipt.number, 50);
    this.receiptData.receipt.date = this.validateString(this.receiptData.receipt.date, 50);
    this.receiptData.receipt.dueDate = this.validateString(this.receiptData.receipt.dueDate, 50);

    // Validate items
    this.receiptData.items = this.receiptData.items.filter(item => {
      item.description = this.validateString(item.description, 200);
      item.quantity = this.validateNumber(item.quantity);
      item.price = this.validateNumber(item.price);
      item.total = this.validateNumber(item.total);

      // Remove empty items
      return item.description.length > 0;
    });

    // Validate totals
    this.receiptData.totals.subtotal = this.validateNumber(this.receiptData.totals.subtotal);
    this.receiptData.totals.vat = this.validateNumber(this.receiptData.totals.vat);
    this.receiptData.totals.total = this.validateNumber(this.receiptData.totals.total);
  }

  // Content Security Policy helpers
  addCSPProtection() {
    // Prevent inline script execution
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = "default-src 'self'; script-src 'self' 'unsafe-eval' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self';";
    document.head.appendChild(meta);
  }

  // Company Data Management
  loadCompanyData() {
    try {
      const savedData = localStorage.getItem('receiptCompanyData');
      return savedData ? JSON.parse(savedData) : null;
    } catch (error) {
      console.error('Error loading company data:', error);
      return null;
    }
  }

  saveCompanyData() {
    try {
      localStorage.setItem('receiptCompanyData', JSON.stringify(this.receiptData.company));
    } catch (error) {
      console.error('Error saving company data:', error);
    }
  }

  resetCompanyData() {
    if (confirm('คุณต้องการรีเซ็ตข้อมูลบริษัทเป็นค่าเริ่มต้นหรือไม่?')) {
      localStorage.removeItem('receiptCompanyData');
      this.receiptData.company = {
        name: 'บริษัท ตัวอย่าง จำกัด',
        address: '123 ถนนสุขุมวิท แขวงคลองตัน เขตวัฒนา กรุงเทพฯ 10110',
        phone: '02-123-4567',
        email: 'info@company.com',
        taxId: '0123456789012'
      };

      // อัปเดตหน้าจอใหม่
      if (this.currentTemplate) {
        this.selectTemplate(this.currentTemplate);
      }

      this.showNotification('✅ รีเซ็ตข้อมูลบริษัทแล้ว', 'success');
    }
  }

  updateVatLabel() {
    const vatSelector = document.getElementById('vatRate');
    const vatRate = vatSelector ? parseFloat(vatSelector.value) : 7;
    const vatLabels = this.receiptPage.querySelectorAll('#vatLabel');

    let labelText;
    if (vatRate === 0) {
      labelText = 'ภาษี:';
    } else {
      labelText = `ภาษีมูลค่าเพิ่ม ${vatRate}%:`;
    }

    vatLabels.forEach(label => {
      label.textContent = labelText;
    });
  }
}

// Initialize the application when DOM is loaded
let receiptDesigner;
document.addEventListener('DOMContentLoaded', () => {
  receiptDesigner = new ReceiptDesigner();
});
