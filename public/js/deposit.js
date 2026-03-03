/* ========================================
   Deposit Page - Nạp tiền
   Copied payment methods from Web MMO Tiện Ích
   Methods: MB Bank (VND), USDT/OxaPay, PayPal (USD)
   ======================================== */

const DepositPage = {
  // THÔNG TIN NGÂN HÀNG (copy từ Web MMO Tiện Ích)
  BANK_INFO: {
    bankId: 'MB',
    bankName: 'MB Bank',
    accountNo: '0965268536',
    accountName: 'NGUYEN TAI THINH',
    logo: 'https://cdn.haitrieu.com/wp-content/uploads/2022/02/Logo-MB-Bank-MBB.png'
  },

  PAYPAL_EMAIL: 'datnetwork.manager@gmail.com',

  selectedMethod: 'bank',

  async load() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div style="max-width:800px;margin:0 auto">
        <div style="text-align:center;margin-bottom:32px">
          <h2 style="font-size:28px;font-weight:800;background:linear-gradient(135deg,#10b981,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px">
            Nạp tiền vào tài khoản
          </h2>
          <p style="color:var(--text-muted);font-size:14px">Chọn phương thức thanh toán phù hợp và nạp tiền để sử dụng dịch vụ</p>
        </div>

        <!-- Lưu ý quan trọng -->
        <div class="card" style="margin-bottom:20px;border-left:4px solid var(--warning)">
          <h4 style="color:var(--warning);margin-bottom:8px"><i class="fas fa-exclamation-triangle" style="margin-right:8px"></i>Lưu ý quan trọng</h4>
          <ul style="color:var(--text-secondary);font-size:13px;list-style:none">
            <li style="padding:4px 0"><span style="color:var(--danger);font-weight:700">•</span> Nạp tối thiểu 2.000 VNĐ. Hệ thống tự động xác nhận trong vòng 30 giây.</li>
            <li style="padding:4px 0"><span style="color:var(--danger);font-weight:700">•</span> Nhập đúng nội dung chuyển khoản để được cộng tiền tự động.</li>
            <li style="padding:4px 0"><span style="color:var(--danger);font-weight:700">•</span> Nếu chuyển sai nội dung, liên hệ admin qua Telegram/Zalo để được hỗ trợ.</li>
          </ul>
        </div>

        <!-- Phương thức thanh toán -->
        <div class="card" style="margin-bottom:20px;padding:24px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
            <div style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#ec4899,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:18px">💳</div>
            <h3 style="font-size:18px;font-weight:700">Phương thức thanh toán</h3>
          </div>

          <div style="display:flex;flex-direction:column;gap:12px" id="payment-methods">
            <!-- MB Bank -->
            <div class="payment-option active" data-method="bank" onclick="DepositPage.selectMethod('bank')" style="display:flex;align-items:center;justify-content:space-between;padding:16px;border-radius:12px;border:2px solid rgba(99,102,241,0.5);background:rgba(99,102,241,0.08);cursor:pointer;transition:all 0.2s">
              <div style="display:flex;align-items:center;gap:12px">
                <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#3b82f6,#06b6d4);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(59,130,246,0.3)">
                  <img src="${this.BANK_INFO.logo}" style="height:32px;width:32px;object-fit:contain;border-radius:8px;background:white;padding:2px" alt="MB">
                </div>
                <div>
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">
                    <span style="font-weight:700;font-size:16px">Chuyển khoản ngân hàng</span>
                    <span style="background:#3b82f6;color:white;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px">VND</span>
                  </div>
                  <p style="color:var(--text-muted);font-size:12px">MB Bank • Xác nhận tự động qua SePay/MBBank API</p>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <span style="background:linear-gradient(135deg,#f97316,#ef4444);color:white;font-size:10px;font-weight:700;padding:4px 12px;border-radius:999px;text-transform:uppercase">PHỔ BIẾN</span>
                <div id="check-bank" style="width:24px;height:24px;border-radius:50%;background:var(--success);display:flex;align-items:center;justify-content:center"><i class="fas fa-check" style="color:white;font-size:12px"></i></div>
              </div>
            </div>

            <!-- Crypto USDT -->
            <div class="payment-option" data-method="crypto" onclick="DepositPage.selectMethod('crypto')" style="display:flex;align-items:center;justify-content:space-between;padding:16px;border-radius:12px;border:2px solid rgba(255,255,255,0.05);background:rgba(255,255,255,0.02);cursor:pointer;transition:all 0.2s">
              <div style="display:flex;align-items:center;gap:12px">
                <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#10b981,#059669);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(16,185,129,0.3)">
                  <span style="font-size:24px">₮</span>
                </div>
                <div>
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">
                    <span style="font-weight:700;font-size:16px">Thanh toán Crypto</span>
                    <span style="background:#10b981;color:white;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px">USDT</span>
                  </div>
                  <p style="color:var(--text-muted);font-size:12px">USDT • Thanh toán tự động OxaPay</p>
                </div>
              </div>
              <div id="check-crypto" style="width:24px;height:24px;border-radius:50%;border:2px solid rgba(255,255,255,0.15);display:none;align-items:center;justify-content:center"><i class="fas fa-check" style="color:white;font-size:12px"></i></div>
            </div>

            <!-- PayPal -->
            <div class="payment-option" data-method="paypal" onclick="DepositPage.selectMethod('paypal')" style="display:flex;align-items:center;justify-content:space-between;padding:16px;border-radius:12px;border:2px solid rgba(255,255,255,0.05);background:rgba(255,255,255,0.02);cursor:pointer;transition:all 0.2s">
              <div style="display:flex;align-items:center;gap:12px">
                <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#2563eb,#60a5fa);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(37,99,235,0.3)">
                  <i class="fab fa-paypal" style="font-size:24px;color:white"></i>
                </div>
                <div>
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">
                    <span style="font-weight:700;font-size:16px">PayPal</span>
                    <span style="background:#2563eb;color:white;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px">USD</span>
                  </div>
                  <p style="color:var(--text-muted);font-size:12px">PayPal • Quốc tế - Chuyển Manual</p>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <span style="background:linear-gradient(135deg,#3b82f6,#06b6d4);color:white;font-size:10px;font-weight:700;padding:4px 12px;border-radius:999px;text-transform:uppercase">GLOBAL</span>
                <div id="check-paypal" style="width:24px;height:24px;border-radius:50%;border:2px solid rgba(255,255,255,0.15);display:none;align-items:center;justify-content:center"><i class="fas fa-check" style="color:white;font-size:12px"></i></div>
              </div>
            </div>
          </div>

          <!-- Trust indicators -->
          <div style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;gap:24px;font-size:11px;color:var(--text-muted)">
            <span>🔒 Bảo mật SSL</span>
            <span>⚡ Xử lý tự động 30s</span>
            <span>💬 Hỗ trợ 24/7</span>
          </div>
        </div>

        <!-- Form nhập số tiền -->
        <div class="card" style="margin-bottom:20px;padding:24px">
          <h4 style="margin-bottom:16px"><i class="fas fa-calculator" style="margin-right:8px;color:var(--success)"></i>Nhập số tiền nạp</h4>
          
          <div id="amount-presets" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">
            <button class="btn btn-secondary" onclick="DepositPage.setAmount(50000)" style="font-size:14px;font-weight:700">50.000đ</button>
            <button class="btn btn-secondary" onclick="DepositPage.setAmount(100000)" style="font-size:14px;font-weight:700">100.000đ</button>
            <button class="btn btn-secondary" onclick="DepositPage.setAmount(200000)" style="font-size:14px;font-weight:700">200.000đ</button>
            <button class="btn btn-secondary" onclick="DepositPage.setAmount(500000)" style="font-size:14px;font-weight:700">500.000đ</button>
            <button class="btn btn-secondary" onclick="DepositPage.setAmount(1000000)" style="font-size:14px;font-weight:700">1.000.000đ</button>
            <button class="btn btn-secondary" onclick="DepositPage.setAmount(2000000)" style="font-size:14px;font-weight:700">2.000.000đ</button>
          </div>

          <div class="form-group" style="margin-bottom:16px">
            <label id="amount-label" style="font-size:13px;margin-bottom:6px;display:block">Hoặc nhập số tiền tùy ý (VNĐ)</label>
            <input type="number" id="deposit-amount" placeholder="Tối thiểu 2.000 VNĐ" min="2000" step="1000" style="width:100%;padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:16px;font-weight:600">
          </div>

          <button class="btn btn-full" id="btn-create-invoice" style="padding:14px;font-size:16px;font-weight:700;background:linear-gradient(135deg,#8b5cf6,#6366f1);border:none;color:white" onclick="DepositPage.createInvoice()">
            <i class="fas fa-receipt"></i> Tạo hóa đơn nạp tiền
          </button>
        </div>

        <!-- Thông tin chuyển khoản (hiện sau khi tạo hóa đơn) -->
        <div id="invoice-section" style="display:none">
          <div class="card" style="padding:24px;border:2px solid rgba(16,185,129,0.3)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
              <h4 style="color:var(--success)"><i class="fas fa-file-invoice-dollar" style="margin-right:8px"></i>Thông tin chuyển khoản</h4>
              <span id="invoice-status" class="badge badge--active" style="font-size:11px">⏳ Đang chờ thanh toán</span>
            </div>
            
            <div id="invoice-details" style="display:grid;gap:12px">
              <!-- Will be filled by JS -->
            </div>

            <div style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.05);text-align:center">
              <div id="qr-code-container" style="margin-bottom:12px">
                <img id="qr-code-img" src="" alt="QR Code" style="max-width:250px;border-radius:8px;display:none">
              </div>
              <p style="color:var(--text-muted);font-size:12px"><i class="fas fa-info-circle"></i> Quét mã QR hoặc chuyển khoản thủ công theo thông tin trên</p>
            </div>

            <button class="btn btn-danger btn-full" style="margin-top:12px" onclick="DepositPage.cancelInvoice()">
              <i class="fas fa-times"></i> Hủy hóa đơn
            </button>

            <!-- Countdown timer -->
            <div id="payment-countdown" style="margin-top:16px;padding:16px;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:12px;text-align:center;display:none">
              <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:8px">
                <i class="fas fa-spinner fa-spin" style="color:var(--info)"></i>
                <span style="font-weight:700;color:var(--info)">Đang kiểm tra giao dịch...</span>
              </div>
              <div style="display:flex;justify-content:center;gap:24px;font-size:13px">
                <span>⏱ Đã chờ: <strong id="elapsed-time" style="color:var(--warning)">0:00</strong></span>
                <span>🔄 Kiểm tra: <strong id="check-count" style="color:var(--success)">0</strong> lần</span>
              </div>
              <div style="margin-top:8px;font-size:12px;color:var(--text-muted)">
                Kiểm tra tiếp sau <strong id="next-check-countdown" style="color:var(--info);font-size:14px">3</strong>s
              </div>
            </div>
          </div>
        </div>

        <!-- Lịch sử nạp tiền -->
        <div class="card" style="margin-top:20px">
          <div class="card-header">
            <span class="card-title"><i class="fas fa-history" style="color:var(--warning);margin-right:8px"></i>Lịch sử nạp tiền</span>
          </div>
          <div style="text-align:center;padding:30px;color:var(--text-muted)">
            <i class="fas fa-receipt" style="font-size:24px;margin-bottom:8px;opacity:0.3;display:block"></i>
            <p>Chức năng đang phát triển</p>
          </div>
        </div>
      </div>
    `;
  },

  selectMethod(method) {
    this.selectedMethod = method;
    // Update payment option styles
    document.querySelectorAll('.payment-option').forEach(el => {
      const m = el.dataset.method;
      if (m === method) {
        el.style.border = '2px solid ' + (m === 'bank' ? 'rgba(99,102,241,0.5)' : m === 'crypto' ? 'rgba(16,185,129,0.5)' : 'rgba(37,99,235,0.5)');
        el.style.background = m === 'bank' ? 'rgba(99,102,241,0.08)' : m === 'crypto' ? 'rgba(16,185,129,0.08)' : 'rgba(37,99,235,0.08)';
      } else {
        el.style.border = '2px solid rgba(255,255,255,0.05)';
        el.style.background = 'rgba(255,255,255,0.02)';
      }
    });
    ['bank', 'crypto', 'paypal'].forEach(m => {
      const check = document.getElementById('check-' + m);
      if (check) {
        check.style.display = m === method ? 'flex' : 'none';
        check.style.background = m === method ? 'var(--success)' : 'transparent';
        check.style.border = m === method ? 'none' : '2px solid rgba(255,255,255,0.15)';
      }
    });

    // Switch amount presets & input between VND and USD
    const presets = document.getElementById('amount-presets');
    const label = document.getElementById('amount-label');
    const input = document.getElementById('deposit-amount');
    if (method === 'bank') {
      presets.innerHTML = `
                <button class="btn btn-secondary" onclick="DepositPage.setAmount(50000)" style="font-size:14px;font-weight:700">50.000đ</button>
                <button class="btn btn-secondary" onclick="DepositPage.setAmount(100000)" style="font-size:14px;font-weight:700">100.000đ</button>
                <button class="btn btn-secondary" onclick="DepositPage.setAmount(200000)" style="font-size:14px;font-weight:700">200.000đ</button>
                <button class="btn btn-secondary" onclick="DepositPage.setAmount(500000)" style="font-size:14px;font-weight:700">500.000đ</button>
                <button class="btn btn-secondary" onclick="DepositPage.setAmount(1000000)" style="font-size:14px;font-weight:700">1.000.000đ</button>
                <button class="btn btn-secondary" onclick="DepositPage.setAmount(2000000)" style="font-size:14px;font-weight:700">2.000.000đ</button>
            `;
      label.textContent = 'Hoặc nhập số tiền tùy ý (VNĐ)';
      input.placeholder = 'Tối thiểu 2.000 VNĐ';
      input.min = '2000';
      input.step = '1000';
    } else {
      presets.innerHTML = `
                <button class="btn btn-secondary" onclick="DepositPage.setAmount(2)" style="font-size:14px;font-weight:700">$2</button>
                <button class="btn btn-secondary" onclick="DepositPage.setAmount(5)" style="font-size:14px;font-weight:700">$5</button>
                <button class="btn btn-secondary" onclick="DepositPage.setAmount(10)" style="font-size:14px;font-weight:700">$10</button>
                <button class="btn btn-secondary" onclick="DepositPage.setAmount(20)" style="font-size:14px;font-weight:700">$20</button>
                <button class="btn btn-secondary" onclick="DepositPage.setAmount(50)" style="font-size:14px;font-weight:700">$50</button>
                <button class="btn btn-secondary" onclick="DepositPage.setAmount(100)" style="font-size:14px;font-weight:700">$100</button>
            `;
      label.textContent = 'Hoặc nhập số tiền tùy ý (USD)';
      input.placeholder = 'Tối thiểu $1 USD';
      input.min = '1';
      input.step = '1';
    }
    input.value = '';
  },

  setAmount(amount) {
    document.getElementById('deposit-amount').value = amount;
  },

  createInvoice() {
    const rawAmount = parseFloat(document.getElementById('deposit-amount').value);
    const isUSD = this.selectedMethod !== 'bank';

    if (isUSD) {
      if (!rawAmount || rawAmount < 1) { App.toast('Số tiền tối thiểu là $1 USD', 'warning'); return; }
    } else {
      if (!rawAmount || rawAmount < 2000) { App.toast('Số tiền tối thiểu là 2.000 VNĐ', 'warning'); return; }
    }

    const amount = isUSD ? Math.round(rawAmount * 25000) : rawAmount; // Convert USD to VND for internal
    const amountUSD = isUSD ? rawAmount : (rawAmount / 25000);

    const username = App.currentUser ? App.currentUser.username : 'user';
    const invoiceCode = 'NAPTIEN ' + username + ' ' + Math.floor(Math.random() * 10000);

    // Show invoice section
    document.getElementById('invoice-section').style.display = 'block';

    if (this.selectedMethod === 'bank') {
      // VietQR Code
      const qrUrl = `https://img.vietqr.io/image/${this.BANK_INFO.bankId}-${this.BANK_INFO.accountNo}-compact.png?amount=${amount}&addInfo=${encodeURIComponent(invoiceCode)}&accountName=${encodeURIComponent(this.BANK_INFO.accountName)}`;

      document.getElementById('invoice-details').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:rgba(255,255,255,0.03);border-radius:8px">
          <span style="color:var(--text-muted);font-size:13px">🏦 Ngân hàng</span>
          <span style="font-weight:700">${this.BANK_INFO.bankName}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:rgba(255,255,255,0.03);border-radius:8px">
          <span style="color:var(--text-muted);font-size:13px">💳 Số tài khoản</span>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-weight:700;font-family:monospace;font-size:16px;color:var(--success)">${this.BANK_INFO.accountNo}</span>
            <button class="btn btn-sm" onclick="DepositPage.copy('${this.BANK_INFO.accountNo}')" style="font-size:10px;padding:4px 8px;background:rgba(99,102,241,0.15);color:#818cf8;border:none"><i class="fas fa-copy"></i></button>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:rgba(255,255,255,0.03);border-radius:8px">
          <span style="color:var(--text-muted);font-size:13px">👤 Chủ tài khoản</span>
          <span style="font-weight:700">${this.BANK_INFO.accountName}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:rgba(255,255,255,0.03);border-radius:8px">
          <span style="color:var(--text-muted);font-size:13px">💰 Số tiền</span>
          <span style="font-weight:800;font-size:20px;color:var(--success)">${amount.toLocaleString('vi-VN')} VNĐ</span>
        </div>
        <div style="padding:12px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:8px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="color:var(--warning);font-size:13px;font-weight:600">📝 Nội dung CK</span>
            <button class="btn btn-sm" onclick="DepositPage.copy('${invoiceCode}')" style="font-size:10px;padding:4px 8px;background:rgba(245,158,11,0.15);color:#f59e0b;border:none"><i class="fas fa-copy"></i> Copy</button>
          </div>
          <div style="font-family:monospace;font-weight:700;font-size:16px;color:var(--warning);margin-top:8px;text-align:center;padding:8px;background:rgba(245,158,11,0.05);border-radius:6px;border:1px dashed rgba(245,158,11,0.3)">${invoiceCode}</div>
        </div>
      `;

      const qrImg = document.getElementById('qr-code-img');
      qrImg.src = qrUrl;
      qrImg.style.display = 'block';

    } else if (this.selectedMethod === 'paypal') {
      document.getElementById('invoice-details').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:rgba(255,255,255,0.03);border-radius:8px">
          <span style="color:var(--text-muted);font-size:13px">📧 PayPal Email</span>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-weight:700;color:#60a5fa">${this.PAYPAL_EMAIL}</span>
            <button class="btn btn-sm" onclick="DepositPage.copy('${this.PAYPAL_EMAIL}')" style="font-size:10px;padding:4px 8px;background:rgba(37,99,235,0.15);color:#60a5fa;border:none"><i class="fas fa-copy"></i></button>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:rgba(255,255,255,0.03);border-radius:8px">
          <span style="color:var(--text-muted);font-size:13px">💰 Số tiền (USD)</span>
          <span style="font-weight:800;font-size:20px;color:var(--info)">$${amountUSD.toFixed(2)} USD</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:rgba(255,255,255,0.03);border-radius:8px">
          <span style="color:var(--text-muted);font-size:13px">💰 Tương đương</span>
          <span style="font-weight:700;color:var(--text-secondary)">${amount.toLocaleString('vi-VN')} VNĐ</span>
        </div>
        <div style="padding:12px;background:rgba(37,99,235,0.08);border:1px solid rgba(37,99,235,0.2);border-radius:8px">
          <p style="color:var(--info);font-weight:600;margin-bottom:8px">📋 Hướng dẫn:</p>
          <ol style="font-size:12px;color:var(--text-secondary);margin-left:16px">
            <li style="padding:3px 0">Mở PayPal → Send Money</li>
            <li style="padding:3px 0">Gửi đến: <strong style="color:#60a5fa">${this.PAYPAL_EMAIL}</strong></li>
            <li style="padding:3px 0">Nhập số tiền: <strong>$${amountUSD.toFixed(2)}</strong></li>
            <li style="padding:3px 0">Ghi chú: <strong style="color:var(--warning)">${invoiceCode}</strong></li>
            <li style="padding:3px 0">Chọn "Friends & Family" để không mất phí</li>
            <li style="padding:3px 0">Xác nhận gửi → Liên hệ admin để cộng tiền</li>
          </ol>
        </div>
      `;
      document.getElementById('qr-code-img').style.display = 'none';

    } else if (this.selectedMethod === 'crypto') {
      document.getElementById('invoice-details').innerHTML = `
        <div style="text-align:center;padding:30px">
          <div style="width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,#10b981,#059669);display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 16px">₮</div>
          <h3 style="margin-bottom:8px">Thanh toán USDT qua OxaPay</h3>
          <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px">Số tiền: ≈ <strong style="color:var(--success)">${amountUSD.toFixed(2)} USDT</strong></p>
          <p style="color:var(--warning);font-size:13px"><i class="fas fa-tools"></i> Cổng thanh toán OxaPay đang được tích hợp. Vui lòng sử dụng chuyển khoản ngân hàng hoặc PayPal.</p>
        </div>
      `;
      document.getElementById('qr-code-img').style.display = 'none';
    }

    App.toast('✅ Đã tạo hóa đơn! Vui lòng chuyển khoản theo thông tin bên dưới.', 'success');

    // Start 3-second polling for bank transfers
    if (this.selectedMethod === 'bank') {
      this._startPaymentPolling(amount);
    }
  },

  // ===== Payment polling (every 3s when invoice active) =====
  _pollInterval: null,
  _initialBalance: 0,
  _countdownInterval: null,
  _checkCount: 0,
  _invoiceStartTime: null,

  _startPaymentPolling(expectedAmount) {
    this._stopPaymentPolling(); // Clear any existing
    this._checkCount = 0;
    this._invoiceStartTime = Date.now();

    // Show countdown UI
    const countdownEl = document.getElementById('payment-countdown');
    if (countdownEl) countdownEl.style.display = 'block';

    // Start 1-second countdown ticker
    let nextCheckIn = 3;
    this._countdownInterval = setInterval(() => {
      // Update elapsed time
      const elapsed = Math.floor((Date.now() - this._invoiceStartTime) / 1000);
      const min = Math.floor(elapsed / 60);
      const sec = elapsed % 60;
      const elapsedEl = document.getElementById('elapsed-time');
      if (elapsedEl) elapsedEl.textContent = `${min}:${sec.toString().padStart(2, '0')}`;

      // Update next check countdown
      nextCheckIn--;
      if (nextCheckIn < 0) nextCheckIn = 3;
      const nextEl = document.getElementById('next-check-countdown');
      if (nextEl) nextEl.textContent = nextCheckIn;
    }, 1000);

    // Store initial balance to detect changes
    App.api('/api/subscription/my').then(data => {
      this._initialBalance = data.balance || 0;
    }).catch(() => { });

    console.log('[Deposit] Started payment polling (every 3s)');
    this._pollInterval = setInterval(async () => {
      this._checkCount++;
      nextCheckIn = 3;
      const countEl = document.getElementById('check-count');
      if (countEl) countEl.textContent = this._checkCount;

      try {
        const result = await App.api('/api/subscription/check-deposit');

        if (result.credited > 0) {
          // Payment detected!
          this._stopPaymentPolling();

          // Update sidebar balance
          const balEl = document.getElementById('sidebar-balance');
          if (balEl) balEl.textContent = result.balance.toLocaleString('vi-VN') + 'đ';

          // Show success overlay
          const overlay = document.createElement('div');
          overlay.id = 'payment-success-overlay';
          overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:10000';
          overlay.innerHTML = `
            <div style="background:var(--bg-card);border-radius:16px;padding:32px;text-align:center;max-width:400px;width:90%;border:2px solid var(--success);animation:fadeIn .3s">
              <div style="font-size:64px;margin-bottom:16px">✅</div>
              <h2 style="color:var(--success);margin-bottom:8px">Nạp tiền thành công!</h2>
              <div style="font-size:28px;font-weight:800;color:var(--success);margin-bottom:8px">+${result.credited.toLocaleString('vi-VN')}đ</div>
              <div style="font-size:14px;color:var(--text-muted);margin-bottom:16px">Số dư mới: <strong style="color:var(--text)">${result.balance.toLocaleString('vi-VN')}đ</strong></div>
              <button class="btn btn-primary" style="padding:12px 32px;font-size:14px" onclick="document.getElementById('payment-success-overlay').remove()">
                <i class="fas fa-check"></i> Tuyệt vời!
              </button>
            </div>
          `;
          document.body.appendChild(overlay);

          // Auto close invoice section
          document.getElementById('invoice-section').style.display = 'none';
          document.getElementById('deposit-amount').value = '';

        } else if (result.balance !== this._initialBalance && result.balance > this._initialBalance) {
          // Balance changed even without explicit match (manual admin credit)
          const diff = result.balance - this._initialBalance;
          this._initialBalance = result.balance;

          const balEl = document.getElementById('sidebar-balance');
          if (balEl) balEl.textContent = result.balance.toLocaleString('vi-VN') + 'đ';

          App.toast(`💰 Số dư cập nhật: +${diff.toLocaleString()}đ (tổng: ${result.balance.toLocaleString()}đ)`, 'success');
        }
      } catch { }
    }, 3000);
  },

  _stopPaymentPolling() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
      console.log('[Deposit] Stopped payment polling');
      // Tell backend to stop fast-check
      App.api('/api/subscription/stop-check', 'POST').catch(() => { });
    }
    if (this._countdownInterval) {
      clearInterval(this._countdownInterval);
      this._countdownInterval = null;
    }
    const countdownEl = document.getElementById('payment-countdown');
    if (countdownEl) countdownEl.style.display = 'none';
  },

  cancelInvoice() {
    document.getElementById('invoice-section').style.display = 'none';
    document.getElementById('deposit-amount').value = '';
    this._stopPaymentPolling();
    App.toast('✅ Đã hủy hóa đơn. Bạn có thể tạo hóa đơn mới.', 'info');
  },

  copy(text) {
    navigator.clipboard.writeText(text).then(() => {
      App.toast('✅ Đã copy: ' + text, 'success');
    });
  }
};

