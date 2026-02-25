  import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Dashboard } from './pages/Dashboard';
import { YourRoute } from './pages/YourRoute';
import { Rides } from './pages/Rides';
import { Account } from './pages/Account';
import { PersonalInfo } from './pages/PersonalInfo';
import { SelectRide } from './pages/SelectRide';
import { ConfirmOrder } from './pages/ConfirmOrder';
import { WaitingForDriver } from './pages/WaitingForDriver';
import { DriverComing } from './pages/DriverComing';
import { ScheduleRide } from './pages/ScheduleRide';
import { ScheduleYourRoute } from './pages/ScheduleYourRoute';
import { ScheduleConfirm } from './pages/ScheduleConfirm';
import { WhatWentWrong } from './pages/WhatWentWrong';
import { AletwendeSend } from './pages/AletwendeSend';
import { Shop } from './pages/Shop';
import { OrderFoodies } from './pages/OrderFoodies';
import { FoodiesRoute } from './pages/FoodiesRoute';
import { FoodDelivery } from './pages/FoodDelivery';
import { MessageProvider } from './contexts/MessageContext';
import { RideProvider } from './contexts/RideContext';
import { OrderSessionProvider } from './contexts/OrderSessionContext';
import { FoodOrderSessionProvider } from './contexts/FoodOrderSession';
import { GlobalCartProvider } from './contexts/GlobalCartContext';
import { CurrentRideBar } from './components/CurrentRideBar';
import { WaitingForDriverBar } from './components/WaitingForDriverBar';
import { RatingModal } from './components/RatingModal';
import { useUserProfile } from './hooks/useUserProfile';
import { useFirebaseRide } from './hooks/useFirebaseRide';
import { firebaseService } from './services/firebaseService';
import { getETA } from './utils/etaCalculation';

interface AppState {
  selectedDestination: string;
  selectedPickup: string;
  selectedStops: string[];
  selectedCarType: string;
  selectedPrice: number;
  currentRideId: string | null;
  currentFoodOrderId: string | null;
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useUserProfile();

  const [appState, setAppState] = useState<AppState>({
    selectedDestination: '',
    selectedPickup: 'Current Location',
    selectedStops: [],
    selectedCarType: '',
    selectedPrice: 0,
    currentRideId: localStorage.getItem('currentRideId'),
    currentFoodOrderId: localStorage.getItem('currentFoodOrderId'),
  });

  const { currentRide } = useFirebaseRide(appState.currentRideId);
  const [rideStatus, setRideStatus] = useState<string | null>(null);
  const [driverInfo, setDriverInfo] = useState<any>(null);
  const [eta, setEta] = useState('3 mins');
  const [showRatingModal, setShowRatingModal] = useState(false);

  useEffect(() => {
    const rideId = localStorage.getItem('currentRideId');
    const foodOrderId = localStorage.getItem('currentFoodOrderId');

    if (rideId) {
      setAppState(prev => ({ ...prev, currentRideId: rideId }));
      navigate('/');
    } else if (foodOrderId) {
      setAppState(prev => ({ ...prev, currentFoodOrderId: foodOrderId }));
      navigate('/');
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      console.log('Back online, syncing ride state...');
      const rideId = localStorage.getItem('currentRideId');
      if (rideId) {
        setAppState(prev => ({ ...prev, currentRideId: rideId }));
        navigate('/');
      }
    };

    const handleOffline = () => {
      console.warn('No internet connection. Reconnecting when available...');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [navigate]);

  useEffect(() => {
    if (!appState.currentRideId) return;

    console.log('App: Setting up status listener for ride:', appState.currentRideId);

    const unsubscribe = firebaseService.listenToRideStatus(appState.currentRideId, (statusData) => {
      if (statusData) {
        console.log('App: Ride status update received:', statusData.status);
        setRideStatus(statusData.status);

        if (statusData.status === 'pending' && location.pathname !== '/waiting-for-driver') {
          console.log('App: Navigating to waiting-for-driver (status: pending)');
          navigate('/waiting-for-driver');
        }

        if (statusData.status === 'accepted') {
          console.log('App: Ride accepted, navigating to driver-coming');
          if (location.pathname !== '/driver-coming') {
            navigate('/driver-coming');
          }
        }

        if (statusData.status === 'arrived' || statusData.status === 'started') {
          console.log('App: Driver arrived/started, navigating to driver-coming');
          if (location.pathname !== '/driver-coming') {
            navigate('/driver-coming');
          }
        }

        if (statusData.status === 'completed') {
          console.log('App: Ride completed, showing rating modal');
          setShowRatingModal(true);
        }
      }
    });

    return () => {
      console.log('App: Cleaning up ride status listener');
      unsubscribe();
    };
  }, [appState.currentRideId, location.pathname, navigate]);

  useEffect(() => {
    if (!appState.currentFoodOrderId) return;

    console.log('App: Setting up status listener for food order:', appState.currentFoodOrderId);

    const unsubscribe = firebaseService.listenToFoodOrderStatus(appState.currentFoodOrderId, (statusData) => {
      if (statusData) {
        console.log('App: Food order status update received:', statusData.status);
        setRideStatus(statusData.status);

        if (statusData.status === 'pending' && location.pathname !== '/waiting-for-driver') {
          console.log('App: Food order pending, navigating to waiting-for-driver');
          navigate('/waiting-for-driver');
        }

        if (statusData.status === 'accepted') {
          console.log('App: Food order accepted, navigating to driver-coming');
          if (location.pathname !== '/driver-coming') {
            navigate('/driver-coming');
          }
        }

        if (statusData.status === 'arrived' || statusData.status === 'started') {
          console.log('App: Food delivery driver arrived/started, navigating to driver-coming');
          if (location.pathname !== '/driver-coming') {
            navigate('/driver-coming');
          }
        }

        if (statusData.status === 'completed') {
          console.log('App: Food order completed, showing rating modal');
          setShowRatingModal(true);
        }
      }
    });

    return () => {
      console.log('App: Cleaning up food order status listener');
      unsubscribe();
    };
  }, [appState.currentFoodOrderId, location.pathname, navigate]);

  useEffect(() => {
    if (currentRide?.driverId) {
      firebaseService.getDriverInfo(currentRide.driverId).then((driver) => {
        if (driver) {
          setDriverInfo(driver);
        }
      });
    }
  }, [currentRide?.driverId]);

  const handleRouteComplete = (pickup: string, destination: string, stops: string[]) => {
    setAppState(prev => ({
      ...prev,
      selectedPickup: pickup,
      selectedDestination: destination,
      selectedStops: stops
    }));
  };

  const handleSearchSelect = (address: string) => {
    if (isRideActive()) {
      alert('You already have an active ride.');
      navigate('/driver-coming');
      return;
    }
    setAppState(prev => ({ ...prev, selectedDestination: address }));
    navigate('/select-ride');
  };

  const handleRideSelect = (carType: string, price: number) => {
    if (isRideActive()) {
      alert('You already have an active ride.');
      navigate('/driver-coming');
      return;
    }
    setAppState(prev => ({ ...prev, selectedCarType: carType, selectedPrice: price }));
    navigate('/confirm-order');
  };

  const handleConfirmOrder = () => {
    if (isRideActive()) {
      alert('You already have an active ride.');
      navigate('/driver-coming');
      return;
    }
    navigate('/waiting-for-driver');
  };

  const handleDriverFound = (rideId?: string) => {
    if (rideId) {
      setAppState(prev => ({ ...prev, currentRideId: rideId }));
    }
    navigate('/driver-coming');
  };

  const handleRideCreated = (rideId: string) => {
    localStorage.setItem('currentRideId', rideId);
    setAppState(prev => ({ ...prev, currentRideId: rideId }));
  };

  const handleBack = () => {
    const blockedPaths = ['/waiting-for-driver', '/confirm-order', '/select-ride'];

    if (isRideActive() || isPending()) {
      const message = isPending()
        ? 'You already have an active request.'
        : 'You already have an active ride.';
      const destination = isPending() ? '/waiting-for-driver' : '/driver-coming';

      if (blockedPaths.includes(location.pathname)) {
        alert(message);
        navigate(destination);
        return;
      }

      alert(message);
      navigate(destination);
      return;
    }
    navigate(-1);
  };

  const handleCancelToHome = () => {
    localStorage.removeItem('currentRideId');
    localStorage.removeItem('currentFoodOrderId');
    setAppState(prev => ({ ...prev, currentRideId: null, currentFoodOrderId: null }));
    setRideStatus(null);
    navigate('/');
  };

  const handleSubmitRating = async (rating: number, feedback: string) => {
    const activeId = appState.currentRideId || appState.currentFoodOrderId;
    if (!activeId || !currentRide?.driverId || !profile?.id) return;

    try {
      await firebaseService.submitRating(
        currentRide.driverId,
        activeId,
        rating,
        feedback,
        profile.id
      );
      localStorage.removeItem('currentRideId');
      localStorage.removeItem('currentFoodOrderId');
      setShowRatingModal(false);
      setAppState(prev => ({ ...prev, currentRideId: null, currentFoodOrderId: null }));
      setRideStatus(null);
      navigate('/');
    } catch (error) {
      console.error('Error submitting rating:', error);
    }
  };

  const isRideActive = () => {
    return rideStatus === 'accepted' || rideStatus === 'arrived' || rideStatus === 'started';
  };

  const isPending = () => {
    return rideStatus === 'pending';
  };

  return (
    <GlobalCartProvider>
      <OrderSessionProvider>
        <FoodOrderSessionProvider>
          <MessageProvider userId={profile?.id || null} rideId={appState.currentRideId}>
            <RideProvider rideId={appState.currentRideId}>
          <div className="app">
          <AnimatePresence>
            {isRideActive() && driverInfo && location.pathname !== '/driver-coming' && (
              <CurrentRideBar
                driverName={driverInfo.name}
                carModel={driverInfo.carModel}
                eta={eta}
                status={rideStatus || 'accepted'}
              />
            )}

            {isPending() && location.pathname !== '/waiting-for-driver' && (
              <WaitingForDriverBar />
            )}
          </AnimatePresence>

          <Routes>
            <Route
              path="/"
              element={
                <Dashboard
                  onSearchSelect={(address) => {
                    if (isRideActive()) {
                      alert('You already have an active ride.');
                      return;
                    }
                    handleSearchSelect(address);
                  }}
                />
              }
            />
            <Route
              path="/your-route"
              element={
                isRideActive() ? (
                  <Dashboard onSearchSelect={() => alert('You already have an active ride.')} />
                ) : (
                  <YourRoute onRouteComplete={handleRouteComplete} />
                )
              }
            />
            <Route
              path="/rides"
              element={<Rides />}
            />
            <Route
              path="/account"
              element={<Account />}
            />
            <Route
              path="/personal-info"
              element={<PersonalInfo />}
            />
            <Route
              path="/schedule-ride"
              element={<ScheduleRide />}
            />
            <Route
              path="/schedule-your-route"
              element={<ScheduleYourRoute />}
            />
            <Route
              path="/schedule-confirm"
              element={<ScheduleConfirm />}
            />
            <Route
              path="/what-went-wrong"
              element={<WhatWentWrong />}
            />
            <Route
              path="/aletwende-send"
              element={<AletwendeSend />}
            />
            <Route
              path="/shop"
              element={<Shop />}
            />
            <Route
              path="/order-foodies/:storeId"
              element={<OrderFoodies />}
            />
            <Route
              path="/foodies-route"
              element={<FoodiesRoute />}
            />
            <Route
              path="/food-delivery"
              element={<FoodDelivery />}
            />
            <Route
              path="/select-ride"
              element={
                isRideActive() ? (
                  <Dashboard onSearchSelect={() => alert('You already have an active ride.')} />
                ) : (
                  <SelectRide
                    destination={appState.selectedDestination}
                    pickup={appState.selectedPickup}
                    stops={appState.selectedStops}
                    onBack={handleBack}
                    onSelectRide={handleRideSelect}
                  />
                )
              }
            />
            <Route
              path="/confirm-order"
              element={
                isRideActive() || isPending() ? (
                  <Dashboard onSearchSelect={() => alert('You already have an active ride.')} />
                ) : (
                  <ConfirmOrder
                    destination={appState.selectedDestination}
                    pickup={appState.selectedPickup}
                    stops={appState.selectedStops}
                    carType={appState.selectedCarType}
                    price={appState.selectedPrice}
                    onBack={handleBack}
                    onRideConfirmed={handleConfirmOrder}
                    onRideCreated={handleRideCreated}
                  />
                )
              }
            />
            <Route
              path="/waiting-for-driver"
              element={
                <WaitingForDriver
                  destination={appState.selectedDestination}
                  pickup={appState.selectedPickup}
                  stops={appState.selectedStops}
                  carType={appState.selectedCarType}
                  price={appState.selectedPrice}
                  currentRideId={appState.currentRideId}
                  currentFoodOrderId={appState.currentFoodOrderId}
                  onCancel={handleCancelToHome}
                  onDriverFound={handleDriverFound}
                />
              }
            />
            <Route
              path="/driver-coming"
              element={
                <DriverComing
                  destination={appState.selectedDestination}
                  pickup={appState.selectedPickup}
                  stops={appState.selectedStops}
                  carType={appState.selectedCarType}
                  price={appState.selectedPrice}
                  currentRideId={appState.currentRideId}
                  onBack={handleCancelToHome}
                />
              }
            />
          </Routes>

          {showRatingModal && driverInfo && (
            <RatingModal
              isOpen={showRatingModal}
              onClose={() => {}}
              driverName={driverInfo.name}
              driverPhoto={driverInfo.photo}
              onSubmitRating={handleSubmitRating}
            />
          )}
        </div>
          </RideProvider>
          </MessageProvider>
        </FoodOrderSessionProvider>
      </OrderSessionProvider>
    </GlobalCartProvider>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;