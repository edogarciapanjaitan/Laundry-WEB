import { useState, useMemo, useEffect } from 'react';
import { Order, Stat, Employee } from '@/src/app/outletadmin/_types';

import api from '@/src/app/utils/api';
import { useAuth } from '@/src/context/AuthContext';

export const useOutletOrders = () => {
    const { user } = useAuth();
    const [orders, setOrders] = useState<Order[]>([]);
    const [stats, setStats] = useState<Stat[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('All');
    const [dateFilter, setDateFilter] = useState<'All' | 'Today'>('All');
    const [employeeFilter, setEmployeeFilter] = useState<string>('All');

    const outletId = user?.outlet_id || null;

    // Fetch Orders
    const fetchOrders = async () => {
        if (!outletId) return;
        try {
            setLoading(true);
            const res = await api.get(`/api/admin/orders?outletId=${outletId}`);
            const mappedOrders = res.data.map((o: any) => ({
                id: `#LD-${o.id.substring(0, 6).toUpperCase()}`, // Display ID
                rawId: o.id,
                date: new Date(o.created_at).toLocaleString('en-US', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                }),
                customer: o.pickup_request?.customer?.name || 'Unknown',
                phone: o.pickup_request?.customer?.phone || '-',
                service: o.order_item?.[0]?.laundry_item?.name || 'Service',
                items: o.order_item?.[0]?.itemName || '-',
                quantity: o.order_item?.[0]?.qty || 0,
                weight: o.total_weight || 0,
                status: o.pickup_request?.status || 'WAITING_DRIVER',
                assigned: o.station_task?.[0]?.worker?.name || o.outlet_admin?.name || 'Unassigned',
                total: `Rp ${o.price_total?.toLocaleString() || '0'}`,
                paid: !!o.paid_at,
            }));
            setOrders(mappedOrders);
        } catch (error) {
            console.error('Failed to fetch orders:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const res = await api.get('/api/outlet-admin/dashboard-stats');
            const d = res.data.data;
            setStats([
                {
                    title: 'Orders Today',
                    value: String(d.ordersToday),
                    trend: d.trend || undefined,
                    icon: 'calendar',
                    iconColor: 'text-teal-400',
                },
                {
                    title: 'Pending',
                    value: String(d.pending),
                    subtitle: 'Needs attention',
                    icon: 'clock',
                    iconColor: 'text-yellow-500',
                },
                {
                    title: 'In Progress',
                    value: String(d.inProgress),
                    subtitle: 'Currently washing/drying',
                    icon: 'refresh',
                    iconColor: 'text-blue-400',
                },
                {
                    title: 'Ready',
                    value: String(d.ready),
                    subtitle: 'Waiting for delivery',
                    icon: 'check',
                    iconColor: 'text-green-500',
                },
            ]);
        } catch (error) {
            console.error('Failed to fetch dashboard stats:', error);
        }
    };

    const fetchEmployees = async () => {
        if (!outletId) return;
        try {
            const res = await api.get('/workers');
            // Check for various response structures
            const workersData = res.data.data || res.data;

            if (Array.isArray(workersData)) {
                // Filter for this outlet specifically if the API returns all
                // The interface we defined expects id, name, role
                const mapped = workersData.map((w: any) => ({
                    id: w.staff_id, // Use User ID (staff_id) or Staff ID (id)? Let's use staff_id to match user linkage if needed, or id. 
                    // Order.outlet_admin_id likely refers to User ID. 
                    // However, the dropdown value is `name`.
                    // Let's use w.staff?.name for the name.
                    name: w.staff?.name || 'Unknown',
                    role: w.staff_type
                }));
                // Filter out non-workers if needed, or keep all staff types
                setEmployees(mapped);
            }
        } catch (error) {
            console.error('Failed to fetch employees:', error);
        }
    };

    useEffect(() => {
        if (outletId) {
            fetchOrders();
            fetchStats();
            fetchEmployees();
        }
    }, [outletId]);

    const filteredOrders = useMemo(() => {
        return orders.filter((order) => {
            const matchesSearch =
                order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.customer.toLowerCase().includes(searchTerm.toLowerCase());

            // Map backend status to frontend filter if needed
            const matchesStatus =
                filterStatus === 'All' || order.status === filterStatus;

            // Simple date check
            const matchesDate =
                dateFilter === 'All' ||
                (dateFilter === 'Today' &&
                    new Date(order.date).toDateString() === new Date().toDateString());

            const matchesEmployee =
                employeeFilter === 'All' || order.assigned === employeeFilter;

            return matchesSearch && matchesStatus && matchesDate && matchesEmployee;
        });
    }, [orders, searchTerm, filterStatus, dateFilter, employeeFilter]);

    const createOrder = async (
        newOrderData: Omit<Order, 'id' | 'date' | 'status' | 'total' | 'paid'>
    ) => {
        if (!outletId) {
            alert('No outlet selected/found');
            return;
        }

        try {
            await api.post('/api/orders', {
                customerName: newOrderData.customer,
                phone: newOrderData.phone,
                serviceName: newOrderData.service,
                items: newOrderData.items,
                quantity: newOrderData.quantity,
                weight: newOrderData.weight,
                assignedStaffName: newOrderData.assigned,
                outletId: outletId,
            });
            fetchOrders(); // Refresh list
        } catch (error) {
            console.error('Failed to create order', error);
            alert('Failed to create order');
        }
    };

    const updateOrder = async (orderId: string, updatedData: any) => {
        try {
            await api.put(`/api/orders/${orderId}`, updatedData);
            fetchOrders(); // Refresh list
        } catch (error) {
            console.error('Failed to update order', error);
            alert('Failed to update order');
        }
    };

    const totalOrders = filteredOrders.length;
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const totalPages = Math.ceil(totalOrders / itemsPerPage);

    const paginatedOrders = filteredOrders.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    return {
        orders: paginatedOrders,
        allOrders: orders,
        totalOrders,
        stats,
        searchTerm,
        setSearchTerm,
        filterStatus,
        setFilterStatus,
        dateFilter,
        setDateFilter,
        employeeFilter,
        setEmployeeFilter,
        createOrder,
        updateOrder,
        currentPage,
        setCurrentPage,
        totalPages,
        itemsPerPage,
        employees,
    };
};
