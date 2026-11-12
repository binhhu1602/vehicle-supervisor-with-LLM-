import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StatCard } from '../common/StatCard.jsx';
import { Markdown } from '../common/Markdown.jsx';
import { StatusBadge, CongestionBadge } from '../common/Badges.jsx';
import { HotspotList } from '../dashboard/HotspotList.jsx';
import { AuthProvider } from '../../store/AuthContext.jsx';
import LoginPage from '../../pages/LoginPage.jsx';
import { camera, metric } from '../../test/fixtures.js';

describe('Component dùng chung', () => {
  it('StatCard hiển thị giá trị, đơn vị và chênh lệch', () => {
    render(<StatCard icon="car" label="Tổng lưu lượng" value="1.234" unit="xe/phút" delta={-5} />);
    expect(screen.getByText('Tổng lưu lượng')).toBeInTheDocument();
    expect(screen.getByText('1.234')).toBeInTheDocument();
    expect(screen.getByText(/▼ 5/)).toHaveClass('delta-down');
  });

  it('Markdown hiển thị tiêu đề, danh sách, in đậm và không chèn HTML', () => {
    const { container } = render(<Markdown text={'### Tiêu đề\n- mục **quan trọng**\n<script>alert(1)</script>'} />);
    expect(screen.getByRole('heading', { name: 'Tiêu đề' })).toBeInTheDocument();
    expect(screen.getByText('quan trọng').tagName).toBe('STRONG');
    expect(container.querySelector('script')).toBeNull();
  });

  it('Badge trạng thái và mức ùn tắc hiển thị nhãn tiếng Việt', () => {
    render(
      <>
        <StatusBadge status="IN_PROGRESS" />
        <CongestionBadge level={3} />
      </>,
    );
    expect(screen.getByText('Đang xử lý')).toBeInTheDocument();
    expect(screen.getByText('Ùn tắc nghiêm trọng')).toBeInTheDocument();
  });

  it('HotspotList xếp nút ùn tắc nặng nhất lên đầu và ẩn camera offline', () => {
    const cams = [
      { ...camera({ id: 'A', name: 'Nút A' }), metric: metric({ level: 1, avgSpeed: 30 }) },
      { ...camera({ id: 'B', name: 'Nút B' }), metric: metric({ level: 3, avgSpeed: 7 }) },
      { ...camera({ id: 'C', name: 'Nút C' }), metric: metric({ online: false }) },
    ];
    render(<HotspotList cameras={cams} />);
    const names = screen.getAllByText(/^Nút /).map((n) => n.textContent);
    expect(names).toEqual(['Nút B', 'Nút A']);
  });
});

describe('Trang đăng nhập', () => {
  const renderLogin = () =>
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<div>Trang chủ</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

  it('báo lỗi khi bỏ trống thông tin', () => {
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Vui lòng nhập');
  });

  it('báo lỗi khi sai mật khẩu', async () => {
    renderLogin();
    fireEvent.change(screen.getByLabelText('Tên đăng nhập'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'sai' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('không đúng');
  });

  it('đăng nhập thành công thì chuyển về trang chủ', async () => {
    renderLogin();
    fireEvent.change(screen.getByLabelText('Tên đăng nhập'), { target: { value: 'operator' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'operator123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await waitFor(() => expect(screen.getByText('Trang chủ')).toBeInTheDocument());
  });
});
