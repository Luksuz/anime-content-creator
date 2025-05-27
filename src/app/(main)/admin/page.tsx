'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/utils/supabase/client';
import { User } from '@supabase/supabase-js'; // Supabase User type
import { DbJob, Profile } from '@/types/supabase'; // Corrected import path
import { useRouter } from 'next/navigation';
import { Eye, X, Key, CheckCircle, XCircle, Database } from 'lucide-react'; // Added new icons
import ApiKeyUploader from '../(home)/components/api-key-uploader';

interface EnrichedUser extends User {
  profile_table_id?: number; // The PK of the profiles table, if needed
  is_admin_profile: boolean | null; // is_admin from the profiles table
  jobs?: DbJob[];
  // We will rely on the `email` from the `User` object (from auth.users) which is part of `EnrichedUser` through extension
}

interface ApiKeyStats {
  validCount: number;
  invalidCount: number;
  totalCount: number;
}

const AdminDashboardPage = () => {
  const { isAdmin, isLoading: authLoading, user: adminUser } = useAuth();
  const supabase = createClient();
  const router = useRouter();
  const [users, setUsers] = useState<EnrichedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State for the jobs modal
  const [isJobsModalOpen, setIsJobsModalOpen] = useState(false);
  const [selectedUserForJobs, setSelectedUserForJobs] = useState<EnrichedUser | null>(null);

  // State for API key statistics
  const [apiKeyStats, setApiKeyStats] = useState<ApiKeyStats>({ validCount: 0, invalidCount: 0, totalCount: 0 });
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/'); // Redirect non-admins
    }
  }, [isAdmin, authLoading, router]);

  // Fetch API key statistics
  const fetchApiKeyStats = async () => {
    setIsLoadingStats(true);
    setStatsError(null);

    try {
      const response = await fetch('/api/api-key-stats');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch API key statistics');
      }

      if (data.success && data.statistics) {
        setApiKeyStats(data.statistics);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err: any) {
      console.error('Error fetching API key statistics:', err);
      setStatsError(err.message || 'Failed to load API key statistics');
    } finally {
      setIsLoadingStats(false);
    }
  };

  useEffect(() => {
    if (isAdmin && adminUser) {
      fetchApiKeyStats();
    }
  }, [isAdmin, adminUser]);

  useEffect(() => {
    if (!isAdmin || !adminUser) return; // Only fetch data if user is admin

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // 1. Fetch all users (auth.users)
        // Note: Supabase client-side typically doesn't allow listing all users for security reasons.
        // This would usually be done via a Supabase function (edge function or serverless function)
        // that has admin privileges.
        // For this example, we'll assume you have a way to get users, or this part needs adjustment
        // based on your Supabase setup (e.g., a view or a function).
        // Let's simulate fetching a few users for now or fetch them if your RLS allows.
        
        // TEMPORARY: Simulate user fetching if direct listing isn't allowed/working client-side.
        // In a real app, this requires a secure backend call.
        // const { data: authUsers, error: usersError } = await supabase.auth.admin.listUsers(); // Requires admin privileges
        // For now, let's fetch profiles and assume users are those with profiles.

        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, user_id, is_admin'); // Fetch profiles table PK as id, user_id (UUID), and is_admin

        if (profilesError) {
          throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
        }

        if (!profilesData) {
          setUsers([]);
          setIsLoading(false);
          return;
        }
        
        // Optional: Fetch actual auth.users to get their emails and other auth details
        // This is more robust for getting user emails than relying on a profiles.email column that doesn't exist.
        // However, listing all users often requires admin privileges and a server-side call.
        // For this client-side example, we will simulate having the auth user data or rely on what Supabase provides with the session.
        // A more complete solution would involve an edge function.

        // Create a map of auth users if you were to fetch them (placeholder)
        // const authUsersMap = new Map(authUsers.map(u => [u.id, u]));
        
        const enrichedUsersData: EnrichedUser[] = await Promise.all(
          profilesData.map(async (profile) => {
            // Fetch jobs (video_records) for each user using their user_id (UUID)
            const { data: videoRecords, error: videoRecordsError } = await supabase
              .from('video_records_rezu') // Changed from 'jobs' to 'video_records'
              .select('*')
              .eq('user_id', profile.user_id); // Match jobs based on the user_id (UUID)

            if (videoRecordsError) {
              console.error(`Failed to fetch video records for user ${profile.user_id}:`, videoRecordsError.message);
            }

            // Construct the EnrichedUser.
            // The `id` for EnrichedUser should be the auth user_id (UUID).
            // The `email` will come from the extended Supabase `User` type if available through auth context or direct fetch.
            // If not, it might be undefined or null depending on how `User` is populated.
            return {
              id: profile.user_id, // This is the crucial UUID for user identity
              // email: (fetched auth.user object for this profile.user_id)?.email || 'N/A',
              // ...other properties from the base Supabase User type would be here implicitly
              profile_table_id: profile.id, // The PK from the 'profiles' table
              is_admin_profile: profile.is_admin,
              jobs: videoRecords || [], // Assign fetched videoRecords to jobs property
              // Cast to EnrichedUser; properties from `User` (like email if session has it) are implicitly part of it.
              email: users.find(u => u.id === profile.user_id)?.email || adminUser?.id === profile.user_id ? adminUser?.email : 'N/A',
            } as EnrichedUser; 
          })
        );

        setUsers(enrichedUsersData);

      } catch (e: any) {
        console.error(e);
        setError(e.message || 'An unexpected error occurred.');
      }
      setIsLoading(false);
    };

    fetchData();
  }, [isAdmin, adminUser, supabase]);

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm(`Are you sure you want to delete this user (${userId})? This action CANNOT be undone and will delete their auth entry and potentially related data based on your DB schema (e.g., profiles due to CASCADE).`)) {
      return;
    }
    
    const originalUsers = [...users];
    setUsers(users.filter(user => user.id !== userId)); // Optimistic UI update
    setError(null);

    try {
      const response = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: userId }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        // responseData.error should contain the error message from the API route
        throw new Error(responseData.error || `Server error: ${response.status}`);
      }

      console.log('User deletion successful:', responseData);
      alert('User deleted successfully.');
      // UI is already updated optimistically.

    } catch (error: any) {
      console.error("Failed to delete user:", error);
      setError(`Failed to delete user: ${error.message || 'Unknown error'}`);
      alert(`Error deleting user: ${error.message || 'An unknown error occurred. Please try again.'}`);
      setUsers(originalUsers); // Revert UI update on error
    }
  };

  const openJobsModal = (user: EnrichedUser) => {
    setSelectedUserForJobs(user);
    setIsJobsModalOpen(true);
  };

  const closeJobsModal = () => {
    setIsJobsModalOpen(false);
    setSelectedUserForJobs(null);
  };

  if (authLoading || isLoading) {
    return <div className="container mx-auto p-4">Loading dashboard...</div>;
  }

  if (!isAdmin) {
    return <div className="container mx-auto p-4">Access Denied. You are not an admin.</div>;
  }

  if (error) {
    return <div className="container mx-auto p-4">Error: {error}</div>;
  }

  return (
    <div className="container mx-auto p-4 space-y-8">
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
      
      {/* User Management Section */}
      <div className="bg-card p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4">User Management</h2>
        {users.length === 0 ? (
          <p>No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700">
              <thead className="bg-gray-800">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">User ID (UUID)</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Email</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Is Admin?</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Jobs Count</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-gray-900 divide-y divide-gray-700">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{user.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{user.email || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{user.is_admin_profile ? 'Yes' : 'No'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{user.jobs?.length || 0}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <button 
                        onClick={() => openJobsModal(user)}
                        className="text-blue-400 hover:text-blue-600 p-1"
                        title="View Jobs"
                      >
                        <Eye size={18} />
                      </button>
                      <button 
                        onClick={() => handleDeleteUser(user.id)}
                        className="text-red-500 hover:text-red-700 disabled:opacity-50 p-1"
                        disabled={user.id === adminUser?.id} // Prevent admin from deleting themselves
                        title="Delete User"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* API Key Management Section */}
      <div className="bg-card p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4">API Key Management</h2>
        
        {/* API Key Statistics */}
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
            <Database className="h-5 w-5" />
            API Key Statistics
          </h3>
          
          {isLoadingStats ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
              Loading statistics...
            </div>
          ) : statsError ? (
            <div className="flex items-center gap-2 text-red-500">
              <XCircle className="h-4 w-4" />
              {statsError}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-green-100 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="font-semibold text-green-800 dark:text-green-200">Valid Keys</span>
                </div>
                <p className="text-2xl font-bold text-green-900 dark:text-green-100 mt-1">
                  {apiKeyStats.validCount}
                </p>
              </div>
              
              <div className="bg-red-100 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-600" />
                  <span className="font-semibold text-red-800 dark:text-red-200">Invalid Keys</span>
                </div>
                <p className="text-2xl font-bold text-red-900 dark:text-red-100 mt-1">
                  {apiKeyStats.invalidCount}
                </p>
              </div>
              
              <div className="bg-blue-100 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2">
                  <Key className="h-5 w-5 text-blue-600" />
                  <span className="font-semibold text-blue-800 dark:text-blue-200">Total Keys</span>
                </div>
                <p className="text-2xl font-bold text-blue-900 dark:text-blue-100 mt-1">
                  {apiKeyStats.totalCount}
                </p>
              </div>
            </div>
          )}
          
          <button
            onClick={fetchApiKeyStats}
            disabled={isLoadingStats}
            className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 disabled:opacity-50"
          >
            {isLoadingStats ? 'Refreshing...' : 'Refresh Statistics'}
          </button>
        </div>

        <p className="text-muted-foreground mb-6">
          Upload and manage WellSaid Labs API keys for the system. These keys will be used for voice generation across all users.
        </p>
        <ApiKeyUploader userId={adminUser?.id || 'admin'} onUploadSuccess={fetchApiKeyStats} />
      </div>

      {isJobsModalOpen && selectedUserForJobs && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-white">Jobs for {selectedUserForJobs.email || selectedUserForJobs.id}</h3>
              <button onClick={closeJobsModal} className="text-gray-400 hover:text-white">
                <X size={24} />
              </button>
            </div>
            {(selectedUserForJobs.jobs?.length || 0) === 0 ? (
              <p className="text-gray-400">No jobs found for this user.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                  <thead className="bg-gray-700">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Job ID</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Created At</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Video URL</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Error</th>
                    </tr>
                  </thead>
                  <tbody className="bg-gray-800 divide-y divide-gray-600">
                    {selectedUserForJobs.jobs?.map((job) => (
                      <tr key={job.id}>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-400 truncate max-w-xs" title={job.id}>{job.id}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-400">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                            ${job.status === 'completed' ? 'bg-green-700 text-green-100' : 
                              job.status === 'pending' ? 'bg-yellow-700 text-yellow-100' : 
                              job.status === 'failed' ? 'bg-red-700 text-red-100' : 'bg-gray-700 text-gray-100'}
                          `}>
                            {job.status || 'N/A'}
                          </span>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-400">{job.created_at ? new Date(job.created_at).toLocaleString() : 'N/A'}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-400 truncate max-w-xs">
                          {job.final_video_url ? (
                            <a href={job.final_video_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline" title={job.final_video_url}>
                              View Video
                            </a>
                          ) : 'N/A'}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-red-400 truncate max-w-xs" title={job.error_message || undefined}>{job.error_message || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboardPage; 