import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';
import MarketPlace from './MarketPlace';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AdminDashboard />} />
        <Route path="/shop" element={<MarketPlace />} />
      </Routes>
    </Router>
  );
}

export default App;