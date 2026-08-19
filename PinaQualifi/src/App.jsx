import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';
import MarketPlace from './MarketPlace';
import FarmerDashboard from './FarmerDashboard';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AdminDashboard />} />
        <Route path="/shop" element={<MarketPlace />} />
        <Route path="/farmer" element={<FarmerDashboard />} />
      </Routes>
    </Router>
  );
}

export default App;