/* ========================================
   Plans Page - Gói dịch vụ (Dynamic from DB)
   ======================================== */

const PlansPage = {
  async load() {
    const content = document.getElementById('content');
    content.innerHTML = `<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin" style="font-size:24px;color:var(--accent-light)"></i></div>`;

    try {
      const [plansData, subData] = await Promise.all([
        App.api('/api/subscription'),
        App.api('/api/subscription/my').catch(() => ({ balance: 0, subscription: null }))
      ]);

      const plans = plansData.plans || [];
      const balance = subData.balance || 0;
      const currentSub = subData.subscription;

      if (!plans.length) {
        content.innerHTML = `<div class="card" style="text-align:center;padding:40px"><i class="fas fa-box-open" style="font-size:48px;color:var(--text-muted);margin-bottom:12px"></i><h3>Chưa có gói dịch vụ</h3><p style="color:var(--text-muted)">Admin chưa setup gói dịch vụ nào.</p></div>`;
        return;
      }

      const planColors = {
        basic: { border: 'rgba(34,197,94,0.2)', gradient: 'linear-gradient(90deg,#22c55e,#10b981)', text: '#22c55e' },
        standard: { border: 'rgba(99,102,241,0.2)', gradient: 'linear-gradient(90deg,#6366f1,#818cf8)', text: 'var(--accent-light)' },
        pro: { border: 'rgba(139,92,246,0.4)', gradient: 'linear-gradient(90deg,#8b5cf6,#a78bfa)', text: '#a78bfa' },
        enterprise: { border: 'rgba(245,158,11,0.2)', gradient: 'linear-gradient(90deg,#f59e0b,#f97316)', text: '#f59e0b' }
      };

      // Current subscription banner
      let subBanner = '';
      if (currentSub) {
        const endDate = new Date(currentSub.end_date);
        const daysLeft = Math.max(0, Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24)));
        subBanner = `
          <div class="card" style="border:2px solid ${currentSub.color || '#6366f1'};margin-bottom:20px;padding:16px">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
              <div style="display:flex;align-items:center;gap:12px">
                <div style="font-size:32px">${currentSub.icon}</div>
                <div>
                  <div style="font-size:16px;font-weight:700">Gói hiện tại: ${currentSub.plan_name}</div>
                  <div style="font-size:12px;color:var(--text-muted)">Hết hạn: ${endDate.toLocaleDateString('vi-VN')} · Còn ${daysLeft} ngày</div>
                </div>
              </div>
              <div style="display:flex;gap:8px;align-items:center">
                <span class="badge badge--active">${currentSub.price_label}/tháng</span>
                <span class="badge" style="background:rgba(245,158,11,0.15);color:#f59e0b">${daysLeft} ngày còn lại</span>
              </div>
            </div>
          </div>
        `;
      }

      // Balance banner
      const balanceBanner = `
        <div class="card" style="margin-bottom:20px;padding:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div style="display:flex;align-items:center;gap:8px">
            <i class="fas fa-wallet" style="font-size:18px;color:var(--accent-light)"></i>
            <span style="font-size:14px;color:var(--text-secondary)">Số dư:</span>
            <span style="font-size:20px;font-weight:800;color:var(--success)">${balance.toLocaleString('vi-VN')}đ</span>
          </div>
          <button class="btn btn-primary btn-sm" onclick="App.navigate('deposit')">
            <i class="fas fa-plus-circle"></i> Nạp tiền
          </button>
        </div>
      `;

      // Generate plan cards
      const planCardsHtml = plans.map(plan => {
        const colors = planColors[plan.slug] || { border: `rgba(99,102,241,0.2)`, gradient: `linear-gradient(90deg,${plan.color},${plan.color}88)`, text: plan.color };
        const isCurrent = currentSub && currentSub.plan_id === plan.id;
        const isHigher = currentSub && plan.price > currentSub.price;
        const isLower = currentSub && plan.price <= currentSub.price;
        const features = Array.isArray(plan.features) ? plan.features : (typeof plan.features === 'string' ? JSON.parse(plan.features || '[]') : []);

        // Base features from plan properties
        const allFeatures = [];
        if (plan.max_farms >= 9999) allFeatures.push({ text: 'Unlimited Acc Farm', bold: true });
        else allFeatures.push({ text: `${plan.max_farms} Acc Farm`, bold: true });

        if (plan.max_members >= 9999) allFeatures.push({ text: 'Unlimited Thành viên' });
        else allFeatures.push({ text: `${plan.max_members} Thành viên Family` });

        allFeatures.push({ text: `Auto Sync ${plan.sync_interval}` });
        features.forEach(f => allFeatures.push({ text: f }));

        // Button
        let btnHtml = '';
        if (isCurrent) {
          btnHtml = `<button class="btn btn-full" style="margin-top:6px;background:rgba(255,255,255,0.1);color:var(--text-muted);border:1px solid rgba(255,255,255,0.1);cursor:default" disabled>
            <i class="fas fa-check-circle"></i> Gói hiện tại
          </button>`;
        } else if (isHigher) {
          btnHtml = `<button class="btn btn-full" style="margin-top:6px;background:${colors.gradient};color:white;border:none" onclick="PlansPage.upgrade(${plan.id}, '${plan.name}')">
            <i class="fas fa-arrow-up"></i> Nâng cấp
          </button>`;
        } else if (isLower) {
          btnHtml = `<button class="btn btn-full" style="margin-top:6px;background:rgba(255,255,255,0.05);color:var(--text-muted);border:1px solid rgba(255,255,255,0.1);cursor:not-allowed" disabled>
            <i class="fas fa-lock"></i> Gói thấp hơn
          </button>`;
        } else {
          btnHtml = `<button class="btn btn-primary btn-full" style="margin-top:6px;background:${colors.gradient};color:white;border:none" onclick="PlansPage.subscribe(${plan.id}, '${plan.name}', ${plan.price})">
            <i class="fas fa-shopping-cart"></i> Đăng ký ngay
          </button>`;
        }

        return `
          <div class="card" style="border:2px solid ${colors.border};position:relative;overflow:hidden;${isCurrent ? 'box-shadow:0 0 20px rgba(99,102,241,0.3)' : ''}${plan.badge_text ? ';transform:scale(1.03)' : ''}">
            <div style="position:absolute;top:0;left:0;right:0;height:4px;background:${colors.gradient}"></div>
            ${plan.badge_text ? `<div style="position:absolute;top:10px;right:10px"><span class="badge" style="background:${plan.badge_color || colors.gradient};color:white;font-size:9px;padding:3px 8px">${plan.badge_text}</span></div>` : ''}
            ${isCurrent ? `<div style="position:absolute;top:10px;left:10px"><span class="badge badge--active" style="font-size:9px;padding:3px 8px">✓ Đang dùng</span></div>` : ''}
            <div style="padding:20px;text-align:center">
              <div style="width:44px;height:44px;border-radius:12px;background:${plan.color}22;display:flex;align-items:center;justify-content:center;margin:0 auto 10px;font-size:22px">${plan.icon}</div>
              <h3 style="font-size:18px;font-weight:700;margin-bottom:2px">${plan.name}</h3>
              <p style="color:var(--text-muted);font-size:11px;margin-bottom:12px">${plan.duration_days || 30} ngày</p>
              <div style="font-size:28px;font-weight:800;color:${colors.text};margin-bottom:2px">${plan.price_label}<span style="font-size:13px;color:var(--text-muted);font-weight:400">/tháng</span></div>
              <div style="border-top:1px solid rgba(255,255,255,0.05);margin:14px 0;padding-top:14px">
                <ul style="list-style:none;text-align:left;font-size:12px;color:var(--text-secondary)">
                  ${allFeatures.map(f => `<li style="padding:5px 0"><i class="fas fa-check" style="color:var(--success);margin-right:6px;width:14px"></i>${f.bold ? `<strong>${f.text}</strong>` : f.text}</li>`).join('')}
                </ul>
              </div>
              ${btnHtml}
            </div>
          </div>
        `;
      }).join('');

      content.innerHTML = `
        <div style="max-width:1000px;margin:0 auto">
          <div style="text-align:center;margin-bottom:24px">
            <h2 style="font-size:28px;font-weight:800;background:linear-gradient(135deg,#818cf8,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px">
              Gói dịch vụ quản lý Google One
            </h2>
            <p style="color:var(--text-muted);font-size:14px">Chọn gói phù hợp với số lượng tài khoản Farm bạn cần quản lý</p>
          </div>

          ${subBanner}
          ${balanceBanner}

          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-bottom:32px">
            ${planCardsHtml}
          </div>

          <div class="card" style="text-align:center;padding:24px">
            <h4 style="color:var(--text-secondary);margin-bottom:8px"><i class="fas fa-headset" style="margin-right:8px;color:var(--accent-light)"></i>Cần tư vấn gói phù hợp?</h4>
            <p style="color:var(--text-muted);font-size:13px;margin-bottom:12px">Liên hệ đội ngũ Shop MMO Tiện Ích để được hỗ trợ</p>
            <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
              <a href="https://t.me/dat_shopmmo_04" target="_blank" class="btn btn-info btn-sm"><i class="fab fa-telegram"></i> Telegram</a>
              <a href="https://zalo.me/g/khxedc741" target="_blank" class="btn btn-success btn-sm"><i class="fas fa-comments"></i> Zalo</a>
              <a href="https://shopmmotienich.com/" target="_blank" class="btn btn-secondary btn-sm"><i class="fas fa-globe"></i> Website</a>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      content.innerHTML = `<div class="card" style="text-align:center;padding:40px"><p style="color:var(--danger)">Lỗi tải gói dịch vụ: ${err.message}</p></div>`;
    }
  },

  async subscribe(planId, planName, price) {
    // Show confirmation modal
    const modal = document.createElement('div');
    modal.id = 'subscribe-modal-overlay';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000';
    modal.innerHTML = `
      <div style="background:var(--bg-card);border-radius:16px;padding:24px;max-width:400px;width:90%;border:1px solid var(--border-color)">
        <h3 style="margin-bottom:16px;font-size:18px"><i class="fas fa-shopping-cart" style="color:var(--accent-light);margin-right:8px"></i>Xác nhận đăng ký</h3>
        <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:12px;margin-bottom:16px">
          <div style="font-size:14px;font-weight:600;margin-bottom:4px">${planName}</div>
          <div style="font-size:20px;font-weight:800;color:var(--accent-light)">${price.toLocaleString()}đ<span style="font-size:12px;color:var(--text-muted)">/30 ngày</span></div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-secondary" onclick="document.getElementById('subscribe-modal-overlay').remove()">Hủy</button>
          <button class="btn btn-primary" id="confirm-subscribe-btn" onclick="PlansPage.confirmSubscribe(${planId})">
            <i class="fas fa-check"></i> Xác nhận đăng ký
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async confirmSubscribe(planId) {
    const btn = document.getElementById('confirm-subscribe-btn') || document.getElementById('confirm-upgrade-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...'; }

    try {
      const result = await App.api('/api/subscription/subscribe', 'POST', { plan_id: planId });
      // Close ANY open modal overlay
      document.getElementById('subscribe-modal-overlay')?.remove();
      document.getElementById('upgrade-modal-overlay')?.remove();
      App.toast(result.message, 'success');
      await this.load(); // Reload plans page
    } catch (err) {
      App.toast(err.message || 'Lỗi đăng ký', 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Xác nhận'; }
    }
  },

  async upgrade(planId, planName) {
    try {
      const preview = await App.api('/api/subscription/upgrade-preview', 'POST', { plan_id: planId });

      const modal = document.createElement('div');
      modal.id = 'upgrade-modal-overlay';
      modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000';

      // Build shortfall payment section if not enough balance
      let shortfallHtml = '';
      if (!preview.can_afford) {
        const shortfall = preview.cost - preview.balance;
        shortfallHtml = `
          <div id="shortfall-section" style="margin-top:12px;border-top:1px solid rgba(255,255,255,0.08);padding-top:12px">
            <div style="text-align:center;color:var(--danger);font-size:13px;margin-bottom:8px">
              <i class="fas fa-exclamation-triangle"></i> Bạn còn thiếu <strong>${shortfall.toLocaleString()}đ</strong>
            </div>
            <div id="shortfall-loading" style="text-align:center;padding:8px;font-size:12px;color:var(--text-muted)">
              <i class="fas fa-spinner fa-spin"></i> Đang kiểm tra phương thức thanh toán...
            </div>
          </div>
        `;
      }

      modal.innerHTML = `
        <div style="background:var(--bg-card);border-radius:16px;padding:24px;max-width:420px;width:90%;border:1px solid var(--border-color);max-height:90vh;overflow-y:auto">
          <h3 style="margin-bottom:16px;font-size:18px"><i class="fas fa-arrow-up" style="color:var(--accent-light);margin-right:8px"></i>Nâng cấp gói</h3>
          <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:12px;margin-bottom:12px">
            <div style="font-size:13px;color:var(--text-muted);margin-bottom:4px">Gói hiện tại → Gói mới</div>
            <div style="font-size:16px;font-weight:700">${preview.current_plan} → ${preview.plan_name}</div>
          </div>
          <div style="font-size:13px;margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
              <span style="color:var(--text-muted)">Giá gói mới:</span>
              <span style="font-weight:600">${preview.plan_price.toLocaleString()}đ</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
              <span style="color:var(--success)">Hoàn lại gói cũ:</span>
              <span style="font-weight:600;color:var(--success)">-${preview.refund.toLocaleString()}đ</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:15px;font-weight:700">
              <span>Cần thanh toán:</span>
              <span style="color:var(--accent-light)">${preview.cost.toLocaleString()}đ</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px">
              <span style="color:var(--text-muted)">Số dư hiện tại:</span>
              <span style="${preview.can_afford ? 'color:var(--success)' : 'color:var(--danger)'}">${preview.balance.toLocaleString()}đ ${!preview.can_afford ? '(không đủ)' : ''}</span>
            </div>
          </div>

          ${shortfallHtml}

          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
            <button class="btn btn-secondary" onclick="document.getElementById('upgrade-modal-overlay').remove()">Hủy</button>
            ${preview.can_afford
          ? `<button class="btn btn-primary" id="confirm-upgrade-btn" onclick="PlansPage.confirmSubscribe(${planId})"><i class="fas fa-arrow-up"></i> Xác nhận nâng cấp</button>`
          : `<button class="btn btn-primary" id="confirm-upgrade-btn" onclick="PlansPage.goDeposit()"><i class="fas fa-wallet"></i> Nạp thêm tiền</button>`
        }
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      // If not enough balance, check IP and show appropriate payment
      if (!preview.can_afford) {
        const shortfall = preview.cost - preview.balance;
        this._showShortfallPayment(shortfall);
      }
    } catch (err) {
      App.toast(err.message || 'Lỗi tải thông tin nâng cấp', 'error');
    }
  },

  goDeposit() {
    document.getElementById('upgrade-modal-overlay')?.remove();
    App.navigate('deposit');
  },

  async _showShortfallPayment(shortfall) {
    const loadingEl = document.getElementById('shortfall-loading');
    const sectionEl = document.getElementById('shortfall-section');
    if (!sectionEl) return;

    try {
      // Check IP location via free API
      const resp = await fetch('https://ipapi.co/json/');
      const geo = await resp.json();
      const isVN = geo.country_code === 'VN';

      if (isVN) {
        // Vietnamese IP → show MB Bank QR invoice
        const username = App.currentUser ? App.currentUser.username : 'user';
        const invoiceCode = 'NAPTIEN ' + username + ' ' + Math.floor(Math.random() * 10000);
        const qrUrl = `https://img.vietqr.io/image/MB-0965268536-compact.png?amount=${shortfall}&addInfo=${encodeURIComponent(invoiceCode)}&accountName=${encodeURIComponent('NGUYEN TAI THINH')}`;

        sectionEl.innerHTML = `
          <div style="text-align:center;border-top:1px solid rgba(255,255,255,0.08);padding-top:12px">
            <div style="color:var(--danger);font-size:13px;margin-bottom:10px">
              <i class="fas fa-exclamation-triangle"></i> Bạn còn thiếu <strong>${shortfall.toLocaleString()}đ</strong>
            </div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Quét mã QR để nạp nhanh số tiền còn thiếu</div>
            <img src="${qrUrl}" style="width:200px;height:200px;border-radius:12px;margin-bottom:8px" alt="QR Code" onerror="this.style.display='none'">
            <div style="background:rgba(99,102,241,0.08);border-radius:8px;padding:8px;font-size:11px;text-align:left;margin-bottom:8px">
              <div style="margin-bottom:3px"><strong>Ngân hàng:</strong> MB Bank</div>
              <div style="margin-bottom:3px"><strong>STK:</strong> 0965268536 <span style="cursor:pointer;color:var(--accent-light)" onclick="navigator.clipboard.writeText('0965268536');App.toast('Đã copy STK','success')">📋</span></div>
              <div style="margin-bottom:3px"><strong>Chủ TK:</strong> NGUYEN TAI THINH</div>
              <div style="margin-bottom:3px"><strong>Số tiền:</strong> ${shortfall.toLocaleString()}đ</div>
              <div><strong>Nội dung:</strong> ${invoiceCode} <span style="cursor:pointer;color:var(--accent-light)" onclick="navigator.clipboard.writeText('${invoiceCode}');App.toast('Đã copy nội dung','success')">📋</span></div>
            </div>
            <div style="font-size:10px;color:var(--text-muted)">Sau khi chuyển khoản, số dư sẽ được cập nhật tự động</div>
          </div>
        `;
      } else {
        // Non-VN IP → redirect to deposit page
        sectionEl.innerHTML = `
          <div style="text-align:center;border-top:1px solid rgba(255,255,255,0.08);padding-top:12px">
            <div style="color:var(--danger);font-size:13px;margin-bottom:8px">
              <i class="fas fa-exclamation-triangle"></i> Bạn còn thiếu <strong>${shortfall.toLocaleString()}đ</strong>
            </div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Nạp thêm tiền để nâng cấp gói</div>
          </div>
        `;
      }
    } catch {
      // API failed → show generic deposit link
      if (loadingEl) loadingEl.innerHTML = `<span style="font-size:12px;color:var(--text-muted)">Nhấn "Nạp thêm tiền" để nạp số tiền còn thiếu</span>`;
    }
  }
};

