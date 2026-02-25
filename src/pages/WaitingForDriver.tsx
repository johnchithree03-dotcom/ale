// src/pages/WaitingForDriver.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit, X, Plus, MapPin } from 'lucide-react';
import { BottomNavigation } from '../components/BottomNavigation';
import { DraggablePanel } from '../components/DraggablePanel';
import { ScrollableSection } from '../components/ScrollableSection';
import { MapBackground } from '../components/MapBackground';
import { useFirebaseRide } from '../hooks/useFirebaseRide';
import { useUserProfile } from '../hooks/useUserProfile';
import { calculatePriceWithStops, getCarTypePrice } from '../utils/priceCalculation';
import { useNavigate } from 'react-router-dom';
import { firebaseService } from '../services/firebaseService';

interface WaitingForDriverProps {
  destination: string;
  pickup: string;
  stops: string[];
  carType: string;
  price: number;
  currentRideId: string | null;
  currentFoodOrderId?: string | null;
  onCancel: () => void;
  onDriverFound: () => void;
}

export const WaitingForDriver: React.FC<WaitingForDriverProps> = ({
  destination,
  pickup,
  stops,
  carType,
  price,
  currentRideId,
  currentFoodOrderId,
  onCancel,
  onDriverFound
}) => {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0);
  const [showNoDriverPopup, setShowNoDriverPopup] = useState(false);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [isScanning, setIsScanning] = useState(true);
  const { createRide, currentRide, isLoading, isAccepted } = useFirebaseRide(currentRideId);
  const { profile } = useUserProfile();
  
  // Recalculate price to ensure consistency
  const priceCalculation = calculatePriceWithStops(pickup, destination, stops);
  const finalPrice = getCarTypePrice(priceCalculation.totalPrice, carType);

  // NOTE: Removed the auto-create useEffect that ran on mount.
  // The ConfirmOrder page is responsible for creating the initial ride request.
  // WaitingForDriver only handles scanning, showing 'no driver' popup and "Request again".

  useEffect(() => {
    if (!isScanning) return;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          setIsScanning(false);
          setShowNoDriverPopup(true);
          return 100;
        }
        return prev + (100 / 30); // 30 seconds total
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isScanning]);

  useEffect(() => {
    const activeId = currentRideId || currentFoodOrderId;
    const isRide = !!currentRideId;
    const isFoodOrder = !!currentFoodOrderId;

    if (!activeId) return;

    console.log(`WaitingForDriver: Setting up status listener for ${isRide ? 'ride' : 'food order'}:`, activeId);

    const listener = isRide
      ? firebaseService.listenToRideStatus
      : firebaseService.listenToFoodOrderStatus;

    const unsubscribe = listener.call(firebaseService, activeId, (statusData) => {
      if (!statusData) {
        console.log('WaitingForDriver: No status data received');
        return;
      }

      console.log(`WaitingForDriver: ${isRide ? 'Ride' : 'Food order'} status changed to:`, statusData.status);

      if (statusData.status === 'accepted') {
        console.log(`WaitingForDriver: ${isRide ? 'Ride' : 'Food order'} accepted! Transitioning to driver coming...`);
        setIsScanning(false);
        setShowNoDriverPopup(false);
        setTimeout(() => {
          onDriverFound(activeId);
        }, 500);
      }
    });

    return () => {
      console.log('WaitingForDriver: Cleaning up status listener');
      unsubscribe();
    };
  }, [currentRideId, currentFoodOrderId, onDriverFound]);

  const handleRequestAgain = async () => {
    if (isLoading) return; // prevent double requests

    setShowNoDriverPopup(false);
    setProgress(0);
    setIsScanning(true);

    // Use profile info if available to match ConfirmOrder payload
    const rideRequest = {
      destination,
      pickup,
      stops: stops || [],
      carType,
      price: finalPrice, // Use calculated price
      status: 'pending' as const,
      userId: profile?.id || 'user123',
      userName: profile?.name || 'Unknown User',
    };

    try {
      const rideId = await createRide(rideRequest);
      // After re-requesting, we keep scanning and allow listener (if any) to pick up acceptance.
    } catch (error) {
      console.error('Failed to request again:', error);
      // Optionally show an error toast to user here
    }
  };

  const handleCancelClick = () => {
    setShowCancelConfirmation(true);
  };

  const handleConfirmCancel = async () => {
    try {
      // pick canonical rideId: prefer currentRide.id, else currentRideId, else search by user
      let rideIdToCancel = currentRide?.id || currentRideId || null;

      if (!rideIdToCancel && profile?.id) {
        // Try to find a pending ride for this user
        rideIdToCancel = await firebaseService.findActiveRideByUser(profile.id);
      }

      if (!rideIdToCancel) {
        console.error('No rideId available to cancel. Aborting.');
        setShowCancelConfirmation(false);
        return;
      }

      // Single status update
      await firebaseService.updateRideStatus(rideIdToCancel, 'cancelled');

      setShowCancelConfirmation(false);

      // Navigate to WhatWentWrong and pass real rideId (not unknown-ride)
      navigate('/what-went-wrong', {
        state: {
          rideId: rideIdToCancel,
          userId: profile?.id || 'user123',
          userName: profile?.name || 'Unknown User',
          destination,
          pickup,
          stops,
          carType,
          price: finalPrice
        }
      });
    } catch (error) {
      console.error('Error cancelling ride:', error);
      setShowCancelConfirmation(false);
      // still navigate but attempt to resolve ride id in WhatWentWrong
      navigate('/what-went-wrong', {
        state: {
          rideId: currentRide?.id || currentRideId || null,
          userId: profile?.id || 'user123',
          userName: profile?.name || 'Unknown User',
          destination,
          pickup,
          stops,
          carType,
          price: finalPrice
        }
      });
    }
  };

  const handleWaitForDriver = () => {
    setShowCancelConfirmation(false);
  };

  const handleCancelRequest = async () => {
    if (currentRide?.id || currentRideId) {
      try {
        const rideIdToCancel = currentRide?.id || currentRideId!;
        await firebaseService.updateRideStatus(rideIdToCancel, 'cancelled');
      } catch (error) {
        console.error('Error cancelling ride:', error);
      }
    }
    onCancel();
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <MapBackground />
      
      <DraggablePanel initialHeight={450} maxHeight={680} minHeight={300}>
        <div className="space-y-6">
          {/* Status header */}
          <motion.div 
            className="text-center pt-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Waiting for driver to confirm the order
            </h2>
            
            {/* Progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-1 mb-6">
              <motion.div 
                className="bg-green-500 h-1 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: "easeInOut" }}
              />
            </div>
          </motion.div>

          {/* Action buttons */}
          <motion.div 
            className="flex justify-center space-x-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <button className="flex flex-col items-center space-y-2 p-4 hover:bg-gray-50 rounded-xl transition-colors">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                <Edit className="text-gray-600" size={20} />
              </div>
              <span className="text-sm text-gray-600">Edit pickup</span>
            </button>
            
            <button 
              onClick={handleCancelClick}
              className="flex flex-col items-center space-y-2 p-4 hover:bg-gray-50 rounded-xl transition-colors"
            >
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                <X className="text-gray-600" size={20} />
              </div>
              <span className="text-sm text-gray-600">Cancel ride</span>
            </button>
          </motion.div>

          {/* Scrollable content including News & highlights */}
          <ScrollableSection maxHeight="max-h-[420px]">
            <div className="space-y-6 pb-4">
              {/* News & insights */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                <h3 className="font-semibold text-gray-900 mb-3">News & highlights</h3>
                <div className="bg-blue-50 rounded-2xl p-4 mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-16 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <span className="text-2xl">🎧</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">Learn how the audio recording safety feature works</p>
                    </div>
                    <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs">✓</span>
                    </div>
                  </div>
                </div>
              </motion.div>
              {/* Route info */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
              >
                <h3 className="font-semibold text-gray-900 mb-3">My route</h3>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="flex-1 text-gray-700">{pickup}</span>
                    <Edit className="text-gray-400" size={16} />
                  </div>
                  
                  {stops.map((stop, index) => (
                    <div key={index} className="flex items-center space-x-3 ml-6">
                      <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                      <span className="flex-1 text-gray-700">{stop}</span>
                      <Edit className="text-gray-400" size={16} />
                    </div>
                  ))}
                  
                  <div className="flex items-center space-x-3 ml-6">
                    <Plus className="text-blue-600" size={16} />
                    <span className="text-blue-600 font-medium">Add stop</span>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <MapPin className="text-blue-600" size={12} />
                    <span className="flex-1 text-gray-700">{destination}</span>
                    <Edit className="text-gray-400" size={16} />
                  </div>
                  
                  <div className="flex items-center space-x-3 ml-6">
                    <MapPin className="text-gray-500" size={12} />
                    <span className="text-gray-500">Edit destinations</span>
                  </div>
                </div>
              </motion.div>

              {/* Payment method */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
              >
                <h3 className="font-semibold text-gray-900 mb-3">Payment method</h3>
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-5 bg-green-600 rounded flex items-center justify-center">
                        <span className="text-white text-xs font-bold">💳</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Cash</p>
                        <p className="text-sm text-gray-500">Fare • {carType}</p>
                      </div>
                    </div>
                    <span className="font-bold text-gray-900">R {finalPrice}</span>
                  </div>
                </div>
              </motion.div>
            </div>
          </ScrollableSection>
        </div>
      </DraggablePanel>


      {/* Cancel Confirmation Modal */}
      <AnimatePresence>
        {showCancelConfirmation && (
          <motion.div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div 
              className="bg-white rounded-3xl p-6 max-w-sm w-full relative"
              initial={{ scale: 0.8, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 50 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
            >
              {/* Close button */}
              <button
                onClick={handleWaitForDriver}
                className="absolute top-4 right-4 w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center hover:bg-gray-300 transition-colors"
              >
                <X size={20} className="text-gray-600" />
              </button>

              {/* Driver illustration */}
              <div className="text-center mb-6">
                <div className="relative inline-block">
                  <div className="w-24 h-24 bg-pink-100 rounded-full flex items-center justify-center mb-4">
                    <span className="text-4xl">👨🏽‍💼</span>
                  </div>
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                    <X size={16} className="text-white" />
                  </div>
                </div>
              </div>

              <h3 className="text-2xl font-bold text-gray-900 mb-4 text-center">
                Are you sure?
              </h3>
              <p className="text-gray-600 text-center mb-8 leading-relaxed">
                Do you really want to cancel the ride?
                Rebooking may not get you to your
                destination more quickly.
              </p>
              
              <div className="space-y-3">
                <button
                  onClick={handleConfirmCancel}
                  className="w-full bg-red-500 text-white py-4 rounded-2xl font-semibold text-lg hover:bg-red-600 transition-colors"
                >
                  Cancel ride
                </button>
                <button
                  onClick={handleWaitForDriver}
                  className="w-full bg-gray-100 text-gray-800 py-4 rounded-2xl font-semibold text-lg hover:bg-gray-200 transition-colors"
                >
                  Wait for driver
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* No driver found popup */}
      <AnimatePresence>
        {showNoDriverPopup && (
          <motion.div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div 
              className="bg-white rounded-2xl p-6 max-w-sm w-full"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">
                Driver not found
              </h3>
              <p className="text-gray-600 text-center mb-6">
                No drivers are available right now. Would you like to try again?
              </p>
              <div className="space-y-3">
                <button
                  onClick={handleRequestAgain}
                  disabled={isLoading}
                  className={`w-full py-3 rounded-xl font-semibold transition-colors ${
                    isLoading ? 'bg-gray-400 text-gray-700 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  {isLoading ? 'Requesting...' : 'Request again'}
                </button>
                <button
                  onClick={handleCancelRequest}
                  className="w-full bg-gray-200 text-gray-800 py-3 rounded-xl font-semibold hover:bg-gray-300 transition-colors"
                >
                  Cancel request
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};