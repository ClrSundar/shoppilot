'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { subscriptionService } from '@/services/subscription.service';
import {
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Box,
  Stack,
} from '@mui/material';
import { CheckCircle, Cancel, InfoOutlined } from '@mui/icons-material';
import { useState } from 'react';
import { useAppToast } from '@/hooks/use-app-toast';
import { AppToast } from '@/components/common/AppToast';

export default function BillingPage() {
  const { token } = useAuthStore();
  const { toast, showToast, closeToast } = useAppToast();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: currentSub, isLoading: subLoading } = useQuery({
    queryKey: ['subscription', 'me'],
    queryFn: () => subscriptionService.getCurrentSubscription(),
    enabled: !!token,
  });

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ['subscriptions', 'plans'],
    queryFn: () => subscriptionService.getAvailablePlans(),
    enabled: !!token,
  });

  const changePlanMutation = useMutation({
    mutationFn: (planCode: string) => subscriptionService.changePlan(planCode),
    onSuccess: (data) => {
      showToast(data.message, 'success');
      setSelectedPlan(null);
      setShowConfirm(false);
    },
    onError: (error: any) => {
      showToast(error?.response?.data?.message ?? 'Failed to change plan', 'error');
    },
  });

  if (subLoading || plansLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        <Typography variant="h6" color="textSecondary">
          Loading...
        </Typography>
      </Box>
    );
  }

  if (!currentSub || !plans) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error">Failed to load subscription information</Alert>
        <AppToast toast={toast} onClose={closeToast} />
      </Box>
    );
  }

  const handleUpgrade = (planCode: string) => {
    if (planCode === currentSub.plan.code) {
      showToast('You are already on this plan', 'success');
      return;
    }
    setSelectedPlan(planCode);
    setShowConfirm(true);
  };

  return (
    <Box sx={{ p: 4 }}>
      {/* Current Plan */}
      <Box sx={{ mb: 6 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 1 }}>
          Billing & Subscription
        </Typography>
        <Typography color="textSecondary" sx={{ mb: 3 }}>
          Manage your plan and billing information
        </Typography>

        <Card sx={{ backgroundColor: '#f0f7ff', borderColor: '#90caf9', borderWidth: 2 }}>
          <CardContent>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr 1fr' }, gap: 4 }}>
              <Box>
                <Typography variant="caption" color="textSecondary">
                  Current Plan
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#01579b' }}>
                  {currentSub.plan.name}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="textSecondary">
                  Status
                </Typography>
                <Chip
                  label={currentSub.status}
                  color={currentSub.status === 'ACTIVE' ? 'success' : 'default'}
                  size="small"
                  sx={{ mt: 1 }}
                />
              </Box>
              <Box>
                <Typography variant="caption" color="textSecondary">
                  Price
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                  {currentSub.plan.priceAmount === 0 ? (
                    <span style={{ color: '#2e7d32' }}>Free</span>
                  ) : (
                    <>
                      ${currentSub.plan.priceAmount}
                      <span style={{ fontSize: '0.875rem', color: '#666' }}>
                        /{currentSub.plan.billingCycle.toLowerCase()}
                      </span>
                    </>
                  )}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="textSecondary">
                  Billing Cycle
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: '600' }}>
                  {currentSub.plan.billingCycle}
                </Typography>
              </Box>
            </Box>

            {currentSub.trialEndAt && (
              <Alert
                severity="warning"
                sx={{ mt: 3 }}
                icon={<InfoOutlined fontSize="small" />}
              >
                Trial ends on {new Date(currentSub.trialEndAt).toLocaleDateString()}
              </Alert>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* Available Plans */}
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 3 }}>
          Available Plans
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 3 }}>
          {plans.map((plan) => {
            const isCurrent = plan.code === currentSub.plan.code;

            return (
              <Box key={plan.id}>
                <Card
                  sx={{
                    position: 'relative',
                    height: '100%',
                    border: isCurrent ? '2px solid #1976d2' : '1px solid #e0e0e0',
                    boxShadow: isCurrent ? '0 4px 12px rgba(25, 118, 210, 0.3)' : undefined,
                  }}
                >
                  {isCurrent && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        backgroundColor: '#1976d2',
                        color: 'white',
                        px: 2,
                        py: 0.5,
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                      }}
                    >
                      Current
                    </Box>
                  )}

                  <CardContent>
                    <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1 }}>
                      {plan.name}
                    </Typography>
                    <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mb: 2 }}>
                      {plan.description}
                    </Typography>

                    {/* Price */}
                    <Box sx={{ mb: 3 }}>
                      <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                        {plan.priceAmount === 0 ? (
                          <span>Free</span>
                        ) : (
                          <>
                            ${plan.priceAmount}
                            <span style={{ fontSize: '0.875rem', fontWeight: 'normal' }}>
                              /{plan.billingCycle.toLowerCase()}
                            </span>
                          </>
                        )}
                      </Typography>
                      {plan.trialDays > 0 && (
                        <Typography variant="caption" color="success.main" sx={{ mt: 1 }}>
                          {plan.trialDays} days free trial
                        </Typography>
                      )}
                    </Box>

                    {/* Features */}
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 2 }}>
                      Features
                    </Typography>
                    <Stack spacing={1.5} sx={{ mb: 3 }}>
                      {plan.features.map((feature) => (
                        <Box key={feature.code} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                          {feature.enabled ? (
                            <CheckCircle
                              sx={{
                                fontSize: '1.25rem',
                                color: '#4caf50',
                                mt: 0.25,
                                flexShrink: 0,
                              }}
                            />
                          ) : (
                            <Cancel
                              sx={{
                                fontSize: '1.25rem',
                                color: '#bdbdbd',
                                mt: 0.25,
                                flexShrink: 0,
                              }}
                            />
                          )}
                          <Box>
                            <Typography
                              variant="body2"
                              color={feature.enabled ? 'textPrimary' : 'textSecondary'}
                            >
                              {feature.name}
                            </Typography>
                            {feature.limitValue && (
                              <Typography variant="caption" color="textSecondary">
                                up to {feature.limitValue}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      ))}
                    </Stack>

                    {/* CTA */}
                    <Button
                      onClick={() => handleUpgrade(plan.code)}
                      disabled={isCurrent || changePlanMutation.isPending}
                      variant={isCurrent ? 'outlined' : 'contained'}
                      fullWidth
                    >
                      {isCurrent
                        ? 'Current Plan'
                        : changePlanMutation.isPending
                          ? 'Processing...'
                          : 'Select Plan'}
                    </Button>
                  </CardContent>
                </Card>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirm} onClose={() => setShowConfirm(false)}>
        <DialogTitle>Change Plan</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mt: 2 }}>
            Are you sure you want to change to the{' '}
            <strong>{plans?.find((p) => p.code === selectedPlan)?.name}</strong> plan?
          </Typography>
          <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 2 }}>
            Your subscription will be updated immediately.
          </Typography>
          {((plans?.find((p) => p.code === selectedPlan)?.trialDays ?? 0) > 0) && (
            <Alert
              severity="info"
              sx={{ mt: 2 }}
              icon={<InfoOutlined fontSize="small" />}
            >
              You'll get {plans?.find((p) => p.code === selectedPlan)?.trialDays} days free
              trial on this plan
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowConfirm(false)} disabled={changePlanMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (selectedPlan) {
                changePlanMutation.mutate(selectedPlan);
              }
            }}
            disabled={changePlanMutation.isPending}
            variant="contained"
          >
            {changePlanMutation.isPending ? 'Changing...' : 'Change Plan'}
          </Button>
        </DialogActions>
      </Dialog>

      <AppToast toast={toast} onClose={closeToast} />
    </Box>
  );
}
