import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';
import MarketPlace from './MarketPlace';
import FarmerDashboard from './FarmerDashboard';
import AdminLogin from './AdminLogin';

function App() {
  return (
    <Router>
      <Routes>
        {/* Marketplace / Main Shop Page */}
        <Route path="/" element={<MarketPlace />} />

        {/* Main Admin Dashboard */}
        <Route path="/admin" element={<AdminDashboard />} />

        {/* Secret Admin Backdoor Login & Logout Screen */}
        <Route path="/admin-login" element={<AdminLogin />} />

        {/* Farmer Dashboard */}
        <Route path="/farmer" element={<FarmerDashboard />} />
      </Routes>
    </Router>
  );
}

export default App;